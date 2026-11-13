/**
 * LitterSense shared data types.
 *
 * Re-exports the cat, session and report interfaces and defines the admin user
 * shapes used by the admin dashboard.
 */

import { Cat } from "@/lib/interfaces/Cat";
import { CatStats } from "@/lib/interfaces/CatStats";
import { CatDetails } from "@/lib/interfaces/CatDetails";
import { Session } from "@/lib/interfaces/Session";
import { HealthLog } from "@/lib/interfaces/HealthLog";
import { PastReport } from "@/lib/interfaces/PastReport";

export interface AdminCat {
  name: string;
  gender: "male" | "female";
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  registeredDate: string; // ISO date string
  status: "active" | "inactive";
  cats: AdminCat[];
}

export type { Cat, CatDetails, CatStats, HealthLog, Session, PastReport };
