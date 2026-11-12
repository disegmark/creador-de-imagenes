import { studioConfig } from "../config";
import { fsStorage } from "./fs";
import { supabaseStorage } from "./supabase";
import type { StudioStorage } from "./types";

export function getStorage(): StudioStorage {
  return studioConfig.storage === "supabase" ? supabaseStorage : fsStorage;
}

export type { StudioStorage } from "./types";
