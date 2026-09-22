"use client";

import { type FormEvent, useState } from "react";
import { requestPasswordReset } from "../client";
import { buttonClassName, fieldClassName } from "./styles";

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Try again.");
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <p className="max-w-sm text-center text-muted-foreground text-sm">
        If an account exists for {email}, a reset link is on its way.
      </p>
    );
  }

  return (
    <form className="grid w-full max-w-sm gap-3" onSubmit={handleSubmit}>
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
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <button className={buttonClassName} disabled={pending} type="submit">
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
};
