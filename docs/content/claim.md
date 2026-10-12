# Verify: the claim

`init` creates the install before you have an account: it waits, unclaimed, and already records the traffic of the hosts it fronts. The claim URL `init` printed, `https://console.tryscope.com/journeys/claim/<token>`, is valid for seven days and binds the install to your account with one click. Until then the records are kept but nothing is stitched into journeys; the install key is shown once, at `init`, and never again.

## The click

1. Open the claim URL. The console asks you to sign in if you are not (the link survives the sign-in).
2. The page shows the install: the form, the hosts, the environment, the package version, the first record if one arrived, and the records seen in the last hour. It lists the customers you may claim for; one is preselected when there is one. "Journeys is not enabled for your account" names the step the account's owner takes.
3. Claim. The install and its records move to your customer, the Installs page opens with the card in its `waiting` or `live` state, and the records that waited are stitched within a minute.

## Afterwards

- A second click on the same link says where the install lives (`409 already_claimed`).
- A link older than seven days has expired: run `journeys init` again, or ask for a new link from the Installs page for an install still unclaimed.
- An install created from the console is claimed from the start; it prints no link.

The claim does not change the sensor: nothing is redeployed, no variable changes, and every rule stays in dry run until you flip it from the console, preview first.
