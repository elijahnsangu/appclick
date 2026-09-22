"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { signIn } from "../client";
import {
  buttonClassName,
  fieldClassName,
  secondaryButtonClassName,
} from "./styles";

export const SignIn = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect?.startsWith("/") &&
    !(rawRedirect.startsWith("//") || rawRedirect.includes("\\"))
      ? rawRedirect
      : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to sign in");
      return;
    }

    router.push(redirectTo);
  };

  const handleGoogle = async () => {
    setError(null);
    setPending(true);

    const result = await signIn.social({
      callbackURL: redirectTo,
      provider: "google",
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to sign in with Google");
    }
  };

  return (
    <div className="grid w-full max-w-sm gap-4">
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <input
          aria-label="Email"
          autoComplete="email"
          className={fieldClassName}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          type="email"
          value={email}
        />
        <input
          aria-label="Password"
          autoComplete="current-password"
          className={fieldClassName}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          type="password"
          value={password}
        />
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <button className={buttonClassName} disabled={pending} type="submit">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button
        className={secondaryButtonClassName}
        disabled={pending}
        onClick={handleGoogle}
        type="button"
      >
        Continue with Google
      </button>
      <div className="flex justify-between text-muted-foreground text-sm">
        <Link className="hover:underline" href="/forgot-password">
          Forgot password?
        </Link>
        <Link
          className="hover:underline"
          href={
            rawRedirect
              ? `/sign-up?redirect=${encodeURIComponent(rawRedirect)}`
              : "/sign-up"
          }
        >
          Create account
        </Link>
      </div>
    </div>
  );
};
