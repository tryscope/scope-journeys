// Preloaded by the tests into a CLI they spawn (`node --import`): the sensor in that process trusts
// the test run's policy key, whose public half the parent passes in TEST_POLICY_KEY_X. The package
// itself reads no such variable.
import { trustPolicyKeyForTests } from "../dist/index.js";

const x = process.env.TEST_POLICY_KEY_X;
if (!x) throw new Error("TEST_POLICY_KEY_X is not set: the test that spawns this CLI passes the run's public key");
trustPolicyKeyForTests("policy:test", await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x }, { name: "Ed25519" }, false, ["verify"]));
