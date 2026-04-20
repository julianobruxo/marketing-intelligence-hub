import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", url.origin));
  
  response.cookies.delete("mih_session");
  
  return response;
}
