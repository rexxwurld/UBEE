// Nigerian mobile-number helpers.
//
// A user's phone number IS their account number (minus the leading 0),
// and phone + PIN is how they log in - so every place that reads a phone
// (register, login, forgot/reset PIN) must normalize it the same way, or
// "08160135713", "+2348160135713" and "8160135713" would be three
// different people. Everything funnels through toNational().
//
// National form = the 10 digits after the leading 0 (8160135713). That is
// the account number. Stored/display form = "0" + national (08160135713).

const NATIONAL_RE = /^[789]\d{9}$/; // NG mobile prefixes: 70x/80x/81x/90x/91x

// Accepts: 08160135713, 8160135713, 2348160135713, +2348160135713,
// "+234 816 013 5713", "0816-013-5713". Returns the 10-digit national
// number, or null if it isn't a valid Nigerian mobile number.
function toNational(input) {
    if (input === undefined || input === null) return null;
    let d = String(input).replace(/[\s\-().]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    if (!/^\d+$/.test(d)) return null;

    if (d.startsWith("234") && d.length === 13) d = d.slice(3);
    else if (d.startsWith("0") && d.length === 11) d = d.slice(1);

    return NATIONAL_RE.test(d) ? d : null;
}

// 08160135713 - what we store on User.phone.
function toLocal(input) {
    const n = toNational(input);
    return n ? "0" + n : null;
}

module.exports = { toNational, toLocal };
