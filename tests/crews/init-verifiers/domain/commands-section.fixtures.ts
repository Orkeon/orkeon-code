// The instructions texts commandsSection is tested on.

export interface CommandsSectionCase {
  name: string;
  markdown: string;
  section: string;
}

const FENCE = "```";

export const COMMANDS_SECTIONS: readonly CommandsSectionCase[] = [
  {
    name: "keeps the section up to the next heading of level two",
    markdown: "# Sample\n\n## Commands\n\nnpm test\n\n## Rules\n\nno secrets\n",
    section: "## Commands\n\nnpm test",
  },
  {
    name: "keeps the section to the end of a file it closes",
    markdown: "# Sample\n\n## Commands\n\nmake check\n",
    section: "## Commands\n\nmake check",
  },
  {
    name: "keeps a subsection of level three inside the section",
    markdown: "## Commands\n\n### Tests\n\npytest -q\n\n# Next\n",
    section: "## Commands\n\n### Tests\n\npytest -q",
  },
  {
    name: "keeps a shell comment of a code fence inside the section",
    markdown: `## Commands\n\n${FENCE}bash\n# all the tests\ncargo test\n${FENCE}\n\n## Rules\n`,
    section: `## Commands\n\n${FENCE}bash\n# all the tests\ncargo test\n${FENCE}`,
  },
  {
    name: "skips a Commands heading inside an earlier code fence",
    markdown: `# Sample\n\n${FENCE}markdown\n## Commands\n\nnot this\n${FENCE}\n\n## Commands\n\nmake check\n`,
    section: "## Commands\n\nmake check",
  },
  {
    name: "reads a section with CRLF line ends up to the next heading",
    markdown: "# Sample\r\n\r\n## Commands\r\n\r\nnpm test\r\n\r\n## Rules\r\n",
    section: "## Commands\n\nnpm test",
  },
  {
    name: "gives nothing for a text without a Commands section",
    markdown: "# Sample\n\n## Rules\n\nno secrets\n",
    section: "",
  },
];
