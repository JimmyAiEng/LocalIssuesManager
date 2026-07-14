import { DomainError } from "./domain_error.js";
import { type AgentId, parseAgentId } from "./value_objects.js";

export const PROMPT_TOKEN = "{prompt}";
export type HarnessData = { agent: AgentId; command: string };

/** Value Object: como invocar um runner (agent + template de comando). Imutável. */
export class Harness {
  readonly agent: AgentId;
  readonly command: string;

  private constructor(agent: AgentId, command: string) {
    this.agent = agent;
    this.command = command;
  }

  static create(agent: string, command: string): Harness {
    if (!command.includes(PROMPT_TOKEN)) throw new DomainError(`command must include ${PROMPT_TOKEN}`);
    return new Harness(parseAgentId(agent), command);
  }

  static fromJSON(data: HarnessData): Harness { return new Harness(data.agent, data.command); }

  toJSON(): HarnessData { return { agent: this.agent, command: this.command }; }

  /**
   * argv com o prompt injetado como UM elemento; conteúdo do item (aspas, `$`, `;`)
   * não escapa para o shell.
   * ponytail: split por espaço; aspas no template não suportadas — troque por um
   * parser de shell-words se algum harness precisar de args com espaço literal.
   */
  argv(prompt: string): string[] {
    return this.command.trim().split(/\s+/).map((token) => token.replaceAll(PROMPT_TOKEN, prompt));
  }
}
