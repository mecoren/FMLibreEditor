import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins the class names of a component, letting the last of two conflicting utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
