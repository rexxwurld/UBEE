// src/modules/deposit/deposit.service.js
//
// This is where a real deposit-detection webhook (from your banking rail
// / NIBSS / provider) should eventually call in. For now it's exposed
// through an admin-key-protected route so you can trigger and test the
// full flow before a real provider is wired up - see deposit.controller.js.

const mongoose = require("mongoose");
const axios = require("axios");
const Wallet = require("../wallet/wallet.model");
const User = require("../auth/user.model");
const Deposit = require("./deposit.model");
const { postSingleEntry } = require("../ledger/ledger.service");
const { postPoolEntry } = require("../ledger/poolLedger.service");
const { creditPool } = require("../settlement/settlementPool.service");
const { signPayload } = require("../../utils/webhookSignature");
const { getPartnerBySlug } = require("../partner/partner.service");
const { SWIFTPAY_WEBHOOK_URL, SWIFTPAY_WEBHOOK_SECRET } = require("../../config/env");
const auditLog = require("../audit/auditLog.service");

async function processDeposit({ accountNumber, amount, reference, rawPayload = null }) {
    amount = Number(amount);

    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("invalid_deposit_amount");
    }

    const existing = await Deposit.findOne({ reference });
    if (existing) return { duplicate: true, deposit: existing };

    const session = await mongoose.startSession();
    let deposit;
    let walletForWebhook;
    let held = false;

    try {
        session.startTransaction();

        const wallet = await Wallet.findOne({ accountNumber }).session(session);
        if (!wallet) throw new Error("destination_wallet_not_found");
        if (!wallet.pool) throw new Error("wallet_not_linked_to_a_settlement_pool");

        // Account-state check (Phase 3). Only applies to end-user
        // wallets (wallet.userId set) - pool/virtual accounts don't
        // have an owning User. Dormant accounts can still receive a
        // deposit (that's a normal, expected way a dormant account
        // gets reactivated); frozen/closed accounts cannot.
        if (wallet.userId) {
            const owner = await User.findById(wallet.userId).session(session);
            if (owner && ["frozen", "closed"].includes(owner.accountState)) {
                throw new Error("destination_account_not_active");
            }
        }

        // Pool wallets (any linkedService/partner slug set) only accept
        // deposits while "assigned" - i.e. the owning partner currently
        // has this account handed out to a customer for an active
        // checkout. If it's already released back to "available"
        // (payment done, or the checkout was abandoned/swept), a
        // deposit landing on it now is not tied to any known
        // customer/order - reject rather than silently crediting the
        // pool for an unrecognized payment. This check is intentionally
        // partner-agnostic (used to be hardcoded to
        // linkedService === "swiftpay" only) - any partner using the
        // same assign/deactivate/release pool-account lifecycle
        // (admin.service.js) gets the same protection.
        //
        // This one stays a hard reject (not "held") deliberately: there
        // is no wallet this deposit could sensibly attach to as a real
        // Deposit row (Deposit.wallet is required, and crediting some
        // unrelated wallet would be worse than not persisting it), and
        // it's a different failure mode from "right wallet, wrong
        // amount" below. An orphaned-deposit queue for this case is a
        // reasonable future addition (Phase 7, ops tooling) but needs
        // its own design, not a same-shaped "held" record pointing at a
        // wallet the deposit doesn't actually belong to.
        if (wallet.linkedService && wallet.status !== "assigned") {
            throw new Error("wallet_not_currently_assigned");
        }

        // wallet.expectedAmount is stored in kobo (as SwiftPay sends it).
        // `amount` here is Naira, entered by a human or the bank rail -
        // convert before comparing, same conversion used for the
        // SwiftPay webhook below.
        //
        // FIX (unrelated to the hold/reject change below, found while
        // fixing the naira/kobo webhook mismatch): this comparison used
        // to compare raw `amount` (naira) directly against
        // `wallet.expectedAmount` (kobo) without ever converting either
        // side - e.g. a correct ₦5,000 deposit (amount = 5000) against
        // an expectedAmount of 500000 kobo would fail as
        // 5000 !== 500000, meaning essentially no correctly matching
        // deposit against a SwiftPay-assigned account could ever pass
        // this check. Converting amount to kobo before comparing.
        const amountInKobo = Math.round(amount * 100);
        const amountMismatch = wallet.expectedAmount != null && amountInKobo !== wallet.expectedAmount;

        if (amountMismatch) {
            // Previously: threw here, and NOTHING was persisted - the
            // money is genuinely sitting at the real bank on this
            // account, but RexxPay would have no record it ever
            // arrived, only a log line (if that). Now: persist it as
            // "held" so it's visible and resolvable, and do NOT touch
            // the wallet balance or post any ledger entries for it -
            // an amount we can't confirm should never be credited
            // automatically.
            held = true;

            [deposit] = await Deposit.create(
                [{
                    reference,
                    wallet: wallet._id,
                    pool: wallet.pool,
                    amount,
                    status: "held",
                    holdReason: `amount_mismatch: received ${amount} NGN, expected ${wallet.expectedAmount / 100} NGN`,
                    rawPayload
                }],
                { session, ordered: true }
            );

            await session.commitTransaction();
            session.endSession();

            await auditLog.record({
                actorType: "system",
                actorRef: "deposit_processor",
                action: "deposit.held_amount_mismatch",
                entityType: "Deposit",
                entityRef: deposit._id.toString(),
                severity: "critical",
                metadata: { accountNumber, amountReceived: amount, expectedAmountKobo: wallet.expectedAmount, reference }
            });

            return { duplicate: false, held: true, deposit };
        }

        wallet.balance += amount;

        // Close the account the moment payment lands, before the webhook
        // even fires - otherwise there's a window between "deposit
        // credited here" and the partner's webhook processing calling
        // our deactivate endpoint - where a second real transfer to the
        // same account number would still pass the assigned-only check
        // above and get credited a second time. Partner-agnostic, same
        // reasoning as the assigned-only check above.
        if (wallet.linkedService) {
            wallet.status = "deactivated";
        }

        await wallet.save({ session });

        [deposit] = await Deposit.create(
            [{ reference, wallet: wallet._id, pool: wallet.pool, amount, status: "confirmed", rawPayload }],
            { session, ordered: true }
        );

        await postSingleEntry({
            wallet: wallet._id,
            direction: "credit",
            amount,
            sourceType: "deposit",
            sourceRef: deposit._id.toString(),
            description: "External deposit",
            session
        });

        await postPoolEntry({
            pool: wallet.pool,
            direction: "credit",
            amount,
            sourceType: "deposit",
            sourceRef: deposit._id.toString(),
            description: `Deposit to ${accountNumber}`,
            session
        });
        await creditPool(wallet.pool, amount, session);

        await session.commitTransaction();
        session.endSession();

        walletForWebhook = wallet;

        await auditLog.record({
            actorType: "system",
            actorRef: "deposit_processor",
            action: "deposit.confirmed",
            entityType: "Deposit",
            entityRef: deposit._id.toString(),
            metadata: { amount, accountNumber, reference }
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            const raced = await Deposit.findOne({ reference });
            if (raced) return { duplicate: true, deposit: raced };
        }
        throw err;
    }

    if (walletForWebhook.linkedService) {
        notifyPartnerOfDeposit(walletForWebhook.linkedService, {
            accountNumber,
            // The partner tracks amounts in kobo everywhere else (see
            // wallet.expectedAmount and transaction.service.js's
            // notify function, which does the same conversion for
            // internal-transfer deposits). `amount` here is naira - this
            // used to be sent unconverted, which meant a deposit landing
            // via the external-bank path reported 100x too small a
            // figure compared to the same deposit landing via an
            // internal wallet-to-wallet transfer. Fixed to match.
            amountReceived: Math.round(amount * 100),
            currency: "NGN",
            bankReference: `rxpbank_${deposit._id.toString()}`,
            depositReference: reference
        }).catch((err) => {
            console.error(`[webhook] failed to notify partner "${walletForWebhook.linkedService}" of deposit:`, err.message);
        });
    }

    return { duplicate: false, deposit };
}

// GENERALIZED (Phase 3a): resolves the partner by slug (wallet.linkedService)
// and uses THEIR webhook URL + secret, rather than one hardcoded global
// SwiftPay URL/secret used for every caller. Falls back to the legacy
// global env vars only if no Partner record exists for that slug yet -
// defensive, since server.js seeds a "swiftpay" Partner from those same
// env vars on startup (see partner.service.js:ensurePartnerFromEnv), so
// normally this fallback should never actually trigger.
async function notifyPartnerOfDeposit(linkedServiceSlug, payload) {
    const partner = await getPartnerBySlug(linkedServiceSlug);

    const webhookUrl = partner ? partner.webhookUrl : SWIFTPAY_WEBHOOK_URL;
    const secret = partner ? partner.webhookSecret : SWIFTPAY_WEBHOOK_SECRET;

    if (!partner) {
        console.error(`[webhook] no Partner record for slug "${linkedServiceSlug}" - falling back to legacy global SwiftPay webhook config. Run the partner-seeding step (see server.js) or register this partner via POST /api/v1/admin/partners.`);
    }

    const signature = signPayload(payload, secret);
    await axios.post(webhookUrl, payload, {
        headers: { "x-partner-signature": signature, "Content-Type": "application/json" },
        timeout: 15000
    });
}

// Admin-facing: list deposits currently sitting at "held" so an
// operator actually has somewhere to look for them (previously these
// didn't exist as records at all - see the "held" status comment on
// the model). Mounted at GET /api/v1/admin/deposits/held.
async function listHeldDeposits() {
    return Deposit.find({ status: "held" }).sort({ createdAt: 1 });
}

// Admin resolves a held deposit one of two ways:
//   action: "credit" - the amount that actually arrived is accepted as
//     correct despite not matching wallet.expectedAmount (e.g. the
//     customer genuinely sent a different amount, or the expected
//     amount itself was wrong) - credits the wallet for deposit.amount
//     and posts the same ledger/pool entries the normal confirmed path
//     would have.
//   action: "reject" - the deposit is NOT credited (e.g. it was a
//     misdirected transfer that needs to be returned by other means,
//     outside RexxPay's own database) - marked "failed", no balance
//     change.
// Either way this is a deliberate, attributable, audit-logged human
// decision - never automatic.
async function resolveHeldDeposit(depositId, { action, performedBy = null } = {}) {
    if (!["credit", "reject"].includes(action)) throw new Error("invalid_resolution_action");

    const session = await mongoose.startSession();
    let deposit;
    let walletForWebhook = null;

    try {
        session.startTransaction();

        deposit = await Deposit.findById(depositId).session(session);
        if (!deposit) throw new Error("deposit_not_found");
        if (deposit.status !== "held") throw new Error("deposit_not_held");

        if (action === "reject") {
            deposit.status = "failed";
            deposit.resolvedAt = new Date();
            deposit.resolvedBy = performedBy;
            await deposit.save({ session });

            await session.commitTransaction();
            session.endSession();

            await auditLog.record({
                actorType: "admin",
                actorRef: performedBy || "unknown_admin",
                action: "deposit.held_rejected",
                entityType: "Deposit",
                entityRef: deposit._id.toString(),
                severity: "critical",
                metadata: { amount: deposit.amount, reference: deposit.reference }
            });

            return { deposit };
        }

        // action === "credit"
        const wallet = await Wallet.findById(deposit.wallet).session(session);
        if (!wallet) throw new Error("wallet_not_found");

        wallet.balance += deposit.amount;
        await wallet.save({ session });

        deposit.status = "confirmed";
        deposit.resolvedAt = new Date();
        deposit.resolvedBy = performedBy;
        await deposit.save({ session });

        await postSingleEntry({
            wallet: wallet._id,
            direction: "credit",
            amount: deposit.amount,
            sourceType: "deposit",
            sourceRef: deposit._id.toString(),
            description: "External deposit (resolved from held: amount mismatch accepted)",
            session
        });

        await postPoolEntry({
            pool: wallet.pool,
            direction: "credit",
            amount: deposit.amount,
            sourceType: "deposit",
            sourceRef: deposit._id.toString(),
            description: `Deposit to ${wallet.accountNumber} (resolved from held)`,
            session
        });
        await creditPool(wallet.pool, deposit.amount, session);

        await session.commitTransaction();
        session.endSession();

        walletForWebhook = wallet;

        await auditLog.record({
            actorType: "admin",
            actorRef: performedBy || "unknown_admin",
            action: "deposit.held_credited",
            entityType: "Deposit",
            entityRef: deposit._id.toString(),
            severity: "critical",
            metadata: { amount: deposit.amount, reference: deposit.reference }
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }

    if (walletForWebhook && walletForWebhook.linkedService) {
        notifyPartnerOfDeposit(walletForWebhook.linkedService, {
            accountNumber: walletForWebhook.accountNumber,
            amountReceived: Math.round(deposit.amount * 100),
            currency: "NGN",
            bankReference: `rxpbank_${deposit._id.toString()}`,
            depositReference: deposit.reference
        }).catch((err) => {
            console.error(`[webhook] failed to notify partner "${walletForWebhook.linkedService}" of resolved deposit:`, err.message);
        });
    }

    return { deposit };
}

module.exports = { processDeposit, listHeldDeposits, resolveHeldDeposit };
