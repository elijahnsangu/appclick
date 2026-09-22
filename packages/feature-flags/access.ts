import { type ApiData, verifyAccess } from "flags";
import { type NextRequest, NextResponse } from "next/server";
import { featureFlagDefinitions } from "./definitions";

export const getFlags = async (request: NextRequest) => {
  const access = await verifyAccess(request.headers.get("Authorization"));

  if (!access) {
    return NextResponse.json(null, { status: 401 });
  }

  return NextResponse.json<ApiData>({
    definitions: featureFlagDefinitions,
  });
};
