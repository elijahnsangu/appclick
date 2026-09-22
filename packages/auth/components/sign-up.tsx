"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { signIn, signUp } from "../client";
import {
  buttonClassName,
  fieldClassName,
  secondaryButtonClassName,
} from "./styles";

export const SignUp = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect?.startsWith("/") &&
    !(rawRedirect.startsWith("//") || rawRedirect.includes("\\"))
      ? rawRedirect
      : "/";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await signUp.email({ email, name, password });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to sign up");
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
          aria-label="Name"
          autoComplete="name"
          className={fieldClassName}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          required
          type="text"
          value={name}
        />
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
          aria-label="Password (min. 8 characters)"
          autoComplete="new-password"
          className={fieldClassName}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password (min. 8 characters)"
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
          {pending ? "Creating account…" : "Create account"}
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
      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link
          className="hover:underline"
          href={
            rawRedirect
              ? `/sign-in?redirect=${encodeURIComponent(rawRedirect)}`
              : "/sign-in"
          }
        >
          Sign in
        </Link>
      </p>
    </div>
  );
};
