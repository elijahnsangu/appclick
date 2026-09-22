"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { resetPassword } from "../client";
import { buttonClassName, fieldClassName } from "./styles";

export const ResetPassword = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <p className="max-w-sm text-center text-muted-foreground text-sm">
        This reset link is invalid or has expired. Request a new one from the
        forgot-password page.
      </p>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await resetPassword({ newPassword: password, token });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Unable to reset password");
      return;
    }

    router.push("/sign-in");
  };

  return (
    <form className="grid w-full max-w-sm gap-3" onSubmit={handleSubmit}>
      <input
        aria-label="New password (min. 8 characters)"
        autoComplete="new-password"
        className={fieldClassName}
        minLength={8}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="New password (min. 8 characters)"
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
        {pending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
};
