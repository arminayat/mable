"use client";
import { Button } from "@heroui/react";
import { authClient } from "@/lib/auth-client";
export function SignIn() {
  return <Button onPress={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}>Continue with Google</Button>;
}
