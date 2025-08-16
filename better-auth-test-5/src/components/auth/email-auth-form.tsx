"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const baseSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpSchema = baseSchema.extend({
  name: z.string().min(2, "Name is required"),
});

export type EmailAuthMode = "sign-in" | "sign-up";

export function EmailAuthForm({ mode }: { mode: EmailAuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const callback = params.get("callbackURL") ?? "/";

  const schema = mode === "sign-up" ? signUpSchema : baseSchema;
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: (mode === "sign-up"
      ? { email: "", password: "", name: "" }
      : { email: "", password: "" }) as any,
  });

  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setSubmitting] = React.useState(false);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setSubmitting(true);

    if (mode === "sign-in") {
      const { email, password } = values as z.infer<typeof baseSchema>;
      const { error } = await authClient.signIn.email(
        { email, password, callbackURL: callback },
        {
          onError: (ctx) => setError(ctx.error?.message ?? "Sign in failed"),
          onSuccess: () => router.push(callback),
        }
      );
      if (error) setError(error.message ?? "Sign in failed");
    } else {
      const { email, password, name } = values as z.infer<typeof signUpSchema>;
      const { error } = await authClient.signUp.email(
        { email, password, name, callbackURL: callback },
        {
          onError: (ctx) => setError(ctx.error?.message ?? "Sign up failed"),
          onSuccess: () => router.push(callback),
        }
      );
      if (error) setError(error.message ?? "Sign up failed");
    }

    setSubmitting(false);
  };

  const title = mode === "sign-in" ? "Sign in" : "Create account";
  const subtitle = mode === "sign-in" ? "Welcome back" : "Let’s get started";
  const submitLabel = mode === "sign-in" ? "Sign in" : "Sign up";
  const switchHref = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const switchText = mode === "sign-in" ? "Sign up" : "Sign in";
  const switchPrompt =
    mode === "sign-in" ? "Don't have an account?" : "Already have an account?";

  return (
    <div className="mx-auto max-w-sm py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {mode === "sign-up" && (
            <FormField
              control={form.control}
              name={"name" as any}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name={"email" as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input inputMode="email" autoComplete="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={"password" as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} placeholder="Your password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? `${submitLabel}...` : submitLabel}
          </Button>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">{switchPrompt} </span>
            <Link href={switchHref} className="underline underline-offset-4">
              {switchText}
            </Link>
          </div>
        </form>
      </Form>
    </div>
  );
}

# create the auth client
catp src/lib/auth-client.ts <<'EOF'
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: process.env.BETTER_AUTH_URL
})
