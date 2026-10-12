import { withJourneys } from "scope-journeys-next";

export default withJourneys();

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
