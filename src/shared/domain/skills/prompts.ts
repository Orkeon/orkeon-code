// What the decision model reads to suggest skills for a request.
export const SUGGEST_INSTRUCTIONS = "Which of the following playbooks would help an assistant carry out the request of the text?";
export const skillLine = (name: string, description: string): string => (description.length === 0 ? name : `${name}: ${description}`);
export const NO_SKILL_FITS = "None of these playbooks helps with this request.";
