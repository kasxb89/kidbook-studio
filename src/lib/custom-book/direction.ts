import { z } from "zod";

// Public production notes for editors and artists; stored with the book itself.
export const bookDirectionSchema=z.object({
  logline:z.string().trim().min(1).max(300),
  synopsis:z.string().trim().min(1).max(1800),
  arc:z.array(z.object({title:z.string().min(1).max(60),content:z.string().min(1).max(500)})).min(1).max(6),
  visualDirection:z.string().min(1).max(1000),
  palette:z.string().min(1).max(400),
  cameraLanguage:z.string().min(1).max(600),
  textLayout:z.string().min(1).max(600),
  coverConcept:z.string().min(1).max(600),
  continuity:z.array(z.string().min(1).max(400)).min(1).max(12),
});
export const pageDirectionSchema=z.object({
  beat:z.string().min(1).max(400),
  shot:z.string().min(1).max(200),
  action:z.string().min(1).max(500),
  emotion:z.string().min(1).max(300),
  composition:z.string().min(1).max(600),
  textPlacement:z.string().min(1).max(400),
  continuity:z.string().min(1).max(400),
  learningFocus:z.string().max(300).optional(),
});
export type BookDirection=z.infer<typeof bookDirectionSchema>;
export type PageDirection=z.infer<typeof pageDirectionSchema>;
