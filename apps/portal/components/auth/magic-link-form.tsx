'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Mail, CheckCircle2, ArrowLeft, Sparkles } from 'lucide-react';

const magicLinkSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

export function MagicLinkForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
  });

  const onSubmit = async (data: MagicLinkFormData) => {
    setIsLoading(true);
    try {
      const result = await signIn('resend', {
        email: data.email,
        redirect: false,
        callbackUrl: '/user',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      setSentEmail(data.email);
      setEmailSent(true);
      toast.success('Magic link sent!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryAgain = () => {
    setEmailSent(false);
    setSentEmail('');
    reset();
  };

  if (emailSent) {
    return (
      <div className="text-center space-y-4 py-6 px-4 rounded-xl bg-gradient-to-b from-primary/5 to-primary/10 border border-primary/20">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-foreground">Check your inbox</h3>
          <p className="text-sm text-muted-foreground">
            We sent a magic link to
          </p>
          <p className="text-sm font-medium text-foreground">{sentEmail}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Click the link in the email to sign in instantly
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTryAgain}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-3 w-3" />
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="magic-email"
            type="email"
            placeholder="Enter your email address"
            className="h-12 pl-10 bg-background/50 border-border/60 focus:border-primary/50 transition-colors"
            {...register('email')}
            disabled={isLoading}
          />
        </div>
        {errors.email && (
          <p className="text-sm text-destructive pl-1">{errors.email.message}</p>
        )}
      </div>
      <Button
        type="submit"
        className="w-full h-12 font-medium bg-primary hover:bg-primary/90 transition-all"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <span className="animate-pulse">Sending magic link...</span>
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Continue with Email
          </>
        )}
      </Button>
    </form>
  );
}
