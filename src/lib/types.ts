export type ProductUser = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "moderator" | "admin";
  isPremium: boolean;
};

export type CardRecord = {
  id: string;
  title: string;
  recipientName: string;
  message: string;
  theme: string;
  animation: string;
  mediaId?: string | null;
  mediaUrl?: string | null;
  published: boolean;
  shareToken: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

export type ExperienceRecord = {
  id: string;
  title: string;
  recipientName: string;
  memory: string;
  note: string;
  reveal: string;
  theme: string;
  published: boolean;
  shareToken: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

export type CompetitionRecord = {
  id: string;
  slug: string;
  title: string;
  description: string;
  rules: string[];
  criteria: { name: string; description: string; weight: number }[];
  startsAt: string | Date;
  endsAt: string | Date;
};

export type CompetitionEntryStatus = "pending" | "approved" | "rejected" | "needs_review";
