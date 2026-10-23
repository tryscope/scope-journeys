# Changelog

## 1.0.0 (2026-10-23)


### Features

* check Scope's signature on every settings answer ([6b6b28e](https://github.com/tryscope/scope-journeys/commit/6b6b28e9bf5e48f52e1c49ca20e56eae005a8616))
* check Scope's signature on every settings answer ([6b49fe9](https://github.com/tryscope/scope-journeys/commit/6b49fe91fa154989a75985959a580c936f6e6426))


### Bug Fixes

* accept only exact https origins in the policy's signers ([25841fe](https://github.com/tryscope/scope-journeys/commit/25841fe51b57b38227260b3b119ca72cea9bdf6e))
* check every link a rule adds to a text page in linear time ([16de29f](https://github.com/tryscope/scope-journeys/commit/16de29fc5dd985e25d9864cbb8c75b4b2df0ac93))
* check the configured origin on its own, and report a retry's own failure ([fe7ef2d](https://github.com/tryscope/scope-journeys/commit/fe7ef2d81874f8c11cf96f82c78d14d3a741a6af))
* find secret pairs in URLs at any depth and encoding ([4bc4f27](https://github.com/tryscope/scope-journeys/commit/4bc4f2794c46548cbd6d53fef0907946bb500088))
* hand requests the Node sensor cannot read to the app untouched ([59b04e1](https://github.com/tryscope/scope-journeys/commit/59b04e1f958bc018037dfaea5b46b5100046ee82))
* hand requests the Node sensor cannot read to the app untouched ([904b439](https://github.com/tryscope/scope-journeys/commit/904b439ed2a2d559108a79351bc8af4d47d48cb7))
* hash every URL value that could carry a secret, and never resend a request on a sensor without its salt ([b3835d2](https://github.com/tryscope/scope-journeys/commit/b3835d27a3f56223c187778a89fc1b993fa59d97))
* hash secret values however a URL encodes or nests them ([f1d9d3d](https://github.com/tryscope/scope-journeys/commit/f1d9d3d1e59b4aad61e7d89f8779276f9a3d0c65))
* hold settings per install and refuse an environment or epoch the sensor does not take ([8b24f7e](https://github.com/tryscope/scope-journeys/commit/8b24f7e498d45494ef8ac5e7331c1f14b0e67f78))
* keep a saltless mount's bodies whole, deprecate the old trust inputs, and name only sent sessions ([0a5933a](https://github.com/tryscope/scope-journeys/commit/0a5933ac5273c8ecfeccd04f740e9b87f95df17b))
* keep compressed answers, long streams and gate records whole without a salt, and hash the session id in every spelling ([d7ad027](https://github.com/tryscope/scope-journeys/commit/d7ad0275c4e1c0e87e90359dc2d919ea1c7653ed))
* let a declared proxy count outrank x-real-ip, and never hop a looped mount request ([f574fe0](https://github.com/tryscope/scope-journeys/commit/f574fe0a039bfbc2dd74ac2873a141696219b0aa))
* make what the sensor records match its privacy statement ([7abeac3](https://github.com/tryscope/scope-journeys/commit/7abeac35b4d03dc2ffe70c5036abce9a1b9f3b5d))
* make what the sensor records match its privacy statement ([466febd](https://github.com/tryscope/scope-journeys/commit/466febd104662f4fc6dd166341218924fb17eaa9))
* never answer a finder task from a body the sensor left unread ([5216f19](https://github.com/tryscope/scope-journeys/commit/5216f197076570c7f8525fddda6510721ba28988))
* never send a request to the origin a second time once it may have arrived ([60b5643](https://github.com/tryscope/scope-journeys/commit/60b564395ab5f1a6794df20c5f831317a3713ad2))
* never send a request to the origin a second time once it may have arrived ([f7578f9](https://github.com/tryscope/scope-journeys/commit/f7578f9ce856f350d9ca884b96cfad2ce146cc94))
* read nothing from a body the Node mount left unread ([007697e](https://github.com/tryscope/scope-journeys/commit/007697eb6777e861c4efeaa2d2e698bfa126d481))
* read the client address by proxy count and keep every request's record ([04ab237](https://github.com/tryscope/scope-journeys/commit/04ab237b383d070e19b4b29aa12efbffc0f53fae))
* read the client address by proxy count and keep every request's record ([dffdc5b](https://github.com/tryscope/scope-journeys/commit/dffdc5b9479571b316e964c747fd916ecd333253))
* refuse control characters in text a rule adds, and give the timing test room on CI ([b120008](https://github.com/tryscope/scope-journeys/commit/b120008d2606462fa322f3498643dc767f3152ba))
* take destinations only from local config and limit what the settings file can change ([063e9cb](https://github.com/tryscope/scope-journeys/commit/063e9cb9e5657f6ba7c4375ba80b2f484b841063))
* take destinations only from local config and limit what the settings file can change ([94c6dbe](https://github.com/tryscope/scope-journeys/commit/94c6dbe5d5ae5f4f1e53e8ef7837505b3af71465))
* the schemas test generates into a scratch directory (an in-place rewrite raced the parallel test imports) ([09cc6e6](https://github.com/tryscope/scope-journeys/commit/09cc6e6a348540f4b285acb0d390bf0dc3e87a23))
* tighten rule text, page rewrites and the settings fetch ([9a6fa2b](https://github.com/tryscope/scope-journeys/commit/9a6fa2bfd90f3455ed367b26ff0f5da19ce05fb2))
* tighten the page-rewrite and settings-fetch guards ([e7282b2](https://github.com/tryscope/scope-journeys/commit/e7282b2e3561153ab4fb3bc0c9f98087d5b945b9))
* verify Web Bot Auth signatures only for listed signers ([94b0391](https://github.com/tryscope/scope-journeys/commit/94b039167b1837f3fde187bac6ca5e9d2d707d4b))
* verify Web Bot Auth signatures only for listed signers ([17f764b](https://github.com/tryscope/scope-journeys/commit/17f764bb6ea3f3b7b4549c0b21b97afb4a482daf))

## Changelog

Maintained by release-please from conventional commits. Every workspace takes the same version.
