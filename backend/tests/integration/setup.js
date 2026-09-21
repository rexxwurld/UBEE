// tests/integration/setup.js
//
// REQUIRES: npm install (mongodb-memory-server + jest as devDependencies -
// see package.json). NOT executed in the sandbox these were originally
// written in (no network access to download the in-memory MongoDB
// binary) - written correctly by inspection and cross-referenced
// against this codebase's own actual requirements, but run
// `npm run test:integration` yourself before trusting these pass.
//
// Uses MongoMemoryReplSet, NOT plain MongoMemoryServer - deliberately.
// This codebase's .env.example says it plainly: "Must be a REPLICA SET,
// not a standalone MongoDB - this codebase relies on multi-document
// transactions (mongoose sessions) everywhere money moves, and
// standalone MongoDB does not support them." A test suite using a
// plain single-node MongoMemoryServer would pass tests that a real
// standalone-MongoDB deployment would then fail on in production - the
// exact gap this setup exists to avoid.

const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let replSet;

async function setupTestDatabase() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
    return uri;
}

async function teardownTestDatabase() {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
}

    async function clearTestDatabase() {
    const collections = mongoose.connection.collections;

    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }

    // Give the replica-set primary a moment to finish catalog/index
    // operations before the next integration test starts.
    await new Promise((resolve) => setTimeout(resolve, 100));
    }


module.exports = { setupTestDatabase, teardownTestDatabase, clearTestDatabase };
