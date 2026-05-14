import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface RuntimeSkill {
  id: string;
  name: string;
  description: string;
  mode: string;
  model_family: string;
  allowed_tools: string[];
  output_schema_path: string;
  auto_invocable: boolean;
  requires_context_pack: boolean;
  side_effects: boolean;
  instructions: string;
  output_schema: Record<string, any>;
}

export class RuntimeSkillRegistry {
  private skills: Map<string, RuntimeSkill> = new Map();
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir =
      baseDir ||
      process.env.KEIMENON_RUNTIME_SKILLS_DIR ||
      path.resolve(__dirname, '../../../../../agent_context/runtime-skills');
  }

  public loadRuntimeSkills(): void {
    if (!fs.existsSync(this.baseDir)) {
      console.warn(`[RuntimeSkillRegistry] Skill directory not found: ${this.baseDir}`);
      return;
    }

    const dirs = fs.readdirSync(this.baseDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const skillPath = path.join(this.baseDir, dir.name);
      const mdPath = path.join(skillPath, 'SKILL.md');

      if (!fs.existsSync(mdPath)) continue;

      const mdContent = fs.readFileSync(mdPath, 'utf8');

      // Parse YAML frontmatter
      const match = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!match) continue;

      try {
        const metadata = yaml.load(match[1]) as any;
        const instructions = match[2].trim();

        // Load output schema
        let outputSchema = {};
        if (metadata.output_schema) {
          const schemaPath = path.join(skillPath, metadata.output_schema);
          if (fs.existsSync(schemaPath)) {
            outputSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
          }
        }

        const skill: RuntimeSkill = {
          id: metadata.id || dir.name,
          name: metadata.name,
          description: metadata.description,
          mode: metadata.mode,
          model_family: metadata.model_family,
          allowed_tools: metadata.allowed_tools || [],
          output_schema_path: metadata.output_schema,
          auto_invocable: metadata.auto_invocable ?? true,
          requires_context_pack: metadata.requires_context_pack ?? true,
          side_effects: metadata.side_effects ?? false,
          instructions,
          output_schema: outputSchema,
        };

        this.skills.set(skill.id, skill);
      } catch (err) {
        console.error(`[RuntimeSkillRegistry] Failed to parse skill at ${mdPath}`, err);
      }
    }
  }

  public selectRuntimeSkill(skillId?: string): RuntimeSkill {
    if (skillId && this.skills.has(skillId)) {
      return this.skills.get(skillId)!;
    }
    // Fallback to bounded-answer
    if (this.skills.has('bounded-answer')) {
      return this.skills.get('bounded-answer')!;
    }
    throw new Error(
      'Default runtime skill "bounded-answer" not found. Please ensure skills are loaded.'
    );
  }

  public getAllSkills(): RuntimeSkill[] {
    return Array.from(this.skills.values());
  }
}

// Singleton instance
export const skillRegistry = new RuntimeSkillRegistry();
// Note: In a real app, we'd initialize this on server start.
// For testing/mocking, we can call loadRuntimeSkills manually.
