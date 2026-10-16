#!/usr/bin/env python3
"""Static checks for the repository's native definitions; never starts an AI product.

Python 3.11+. TOML uses tomllib. Frontmatter deliberately uses a strict YAML 1.2
subset: one identifier key per line and JSON-encoded scalar/array values. No
anchors, tags, folded strings or implicit scalars. This is not a general YAML
parser or a claim that a product runtime loaded the agents.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import tempfile
import tomllib

EXPECTED = {
    'project-orchestrator': 'codex', 'architecture-reviewer': 'codex',
    'quality-evaluator': 'codex', 'improvement-planner': 'codex',
    'animation-director': 'claude', 'remotion-developer': 'claude',
    'render-engineer': 'claude', 'animation-refiner': 'claude',
    'video-analysis-director': 'antigravity', 'video-content-analyst': 'antigravity',
    'motion-analyst': 'antigravity',
}
SECTIONS = ['責任', '起動条件', '必須入力', '出力と所有権', '使用可能ツール',
            '共通規約・禁止事項', '成功条件', '失敗時', '引継ぎ']
CLAUDE_TOOLS = {'Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash',
                'Agent(remotion-developer, render-engineer, animation-refiner)'}
GOOGLE_TOOLS = {'view_file', 'grep_search', 'replace_file_content', 'run_command'}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def frontmatter(text: str) -> tuple[dict, str]:
    parts = text.split('---\n', 2)
    require(len(parts) == 3 and parts[0] == '', 'frontmatter delimiters missing')
    result = {}
    for line in parts[1].splitlines():
        match = re.fullmatch(r'([A-Za-z][A-Za-z0-9]*): (.+)', line)
        require(match is not None, 'frontmatter requires key: JSON-value YAML subset')
        key, value = match.groups()
        require(key not in result, f'duplicate frontmatter key: {key}')
        result[key] = json.loads(value)
    return result, parts[2]


def check(root: Path) -> int:
    roles = json.loads((root / 'orchestration/roles.json').read_text())
    require(isinstance(roles, list), 'roles must be an array')
    names = [r['name'] for r in roles]
    require(len(names) == len(set(names)), 'duplicate role names')
    require(set(names) == set(EXPECTED), 'missing or unknown role')
    declared = set()
    for role in roles:
        name, product = role['name'], role['product']
        require(EXPECTED[name] == product, f'{name}: wrong product')
        relative = (f'.codex/agents/{name}.toml' if product == 'codex' else
                    f'.claude/agents/{name}.md' if product == 'claude' else
                    f'.agents/agents/{name}/agent.md')
        require(role['definition'] == relative, f'{name}: wrong native path')
        path = root / relative
        require(path.is_file() and not path.is_symlink(), f'{name}: missing or symlink definition')
        declared.add(path)
        text = path.read_text()
        if product == 'codex':
            data = tomllib.loads(text)
            require(set(data) == {'name', 'description', 'developer_instructions'},
                    f'{name}: unexpected Codex key/permission override')
            body = data['developer_instructions']
        else:
            data, body = frontmatter(text)
            keys = {'name', 'description', 'tools', 'model'}
            if product == 'antigravity':
                keys |= {'mainAgent', 'subagent', 'commandExecutionPolicy'}
                require(data.get('mainAgent') is True and data.get('subagent') is True,
                        f'{name}: main/subagent flags')
                require(data.get('commandExecutionPolicy') == 'sandbox', f'{name}: unsafe policy')
            require(set(data) == keys, f'{name}: unexpected frontmatter key')
            require(data['model'] == 'inherit', f'{name}: unapproved model override')
            tools = data['tools']
            allowed = CLAUDE_TOOLS if product == 'claude' else GOOGLE_TOOLS
            require(isinstance(tools, list) and len(tools) > 0 and
                    len(set(tools)) == len(tools) and set(tools) <= allowed,
                    f'{name}: unknown/duplicate tool')
            require(tools == role['allowed_tools'], f'{name}: tool registry drift')
        require(data['name'] == name, f'{name}: identity drift')
        require(isinstance(data['description'], str) and data['description'].strip(),
                f'{name}: empty description')
        require(isinstance(body, str), f'{name}: body must be text')
        for section in SECTIONS:
            require(f'## {section}\n' in body, f'{name}: missing {section}')
        for ref in ['AGENTS.md', 'orchestration/README.md',
                    '.agents/skills/multi-product-motion/SKILL.md', 'manifest.json']:
            require(ref in body, f'{name}: missing common reference {ref}')
        for key in ['responsibility', 'trigger', 'inputs', 'outputs', 'handoff', 'allowed_tools']:
            require(bool(role.get(key)), f'{name}: empty registry {key}')
        require(set(role['handoff']) <= set(EXPECTED), f'{name}: unknown handoff target')
        for value in role['inputs'] + role['outputs']:
            require(value in body, f'{name}: input/output registry drift {value}')
    discovered = (set((root / '.codex/agents').rglob('*.toml')) |
                  set((root / '.claude/agents').rglob('*.md')) |
                  set((root / '.agents/agents').rglob('*.md')))
    require(discovered == declared, 'unregistered native definitions (check duplicate names)')
    return len(roles)


def self_test(root: Path) -> int:
    """Mutation checks use disposable copies, never the live definitions."""
    mutations = [
        ('duplicate role', lambda r: mutate_roles(r, lambda x: x.append(x[0]))),
        ('missing role', lambda r: mutate_roles(r, lambda x: x.pop())),
        ('unknown handoff', lambda r: mutate_roles(r, lambda x: x[0]['handoff'].append('unknown'))),
        ('missing definition', lambda r: (r / '.codex/agents/quality-evaluator.toml').unlink()),
        ('bad TOML', lambda r: append(r / '.codex/agents/quality-evaluator.toml', '\nname = "duplicate"\n')),
        ('duplicate YAML key', lambda r: replace(r / '.claude/agents/render-engineer.md',
                                                'model: "inherit"', 'model: "inherit"\nmodel: "inherit"')),
        ('invented tool', lambda r: replace(r / '.agents/agents/motion-analyst/agent.md',
                                           '"run_command"', '"magic_video_tool"')),
        ('unsafe permission', lambda r: replace(r / '.agents/agents/motion-analyst/agent.md',
                                               '"sandbox"', '"eager"')),
        ('unknown key', lambda r: replace(r / '.claude/agents/render-engineer.md',
                                         'model: "inherit"', 'model: "inherit"\nbogus: true')),
    ]
    for name, mutate in mutations:
        with tempfile.TemporaryDirectory(prefix='agent-definitions-') as folder:
            copy = Path(folder)
            for directory in ['.codex/agents', '.claude/agents', '.agents/agents']:
                shutil.copytree(root / directory, copy / directory)
            (copy / 'orchestration').mkdir()
            shutil.copyfile(root / 'orchestration/roles.json', copy / 'orchestration/roles.json')
            require(check(copy) == 11, 'valid fixture failed')
            mutate(copy)
            try:
                check(copy)
            except (ValueError, KeyError, TypeError, FileNotFoundError):
                continue
            raise ValueError(f'mutation unexpectedly accepted: {name}')
    return len(mutations)


def mutate_roles(root: Path, operation) -> None:
    path = root / 'orchestration/roles.json'
    value = json.loads(path.read_text())
    operation(value)
    path.write_text(json.dumps(value))


def append(path: Path, text: str) -> None:
    path.write_text(path.read_text() + text)


def replace(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    require(old in text, 'mutation target not found')
    path.write_text(text.replace(old, new))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    try:
        count = check(args.root.resolve())
        mutations = self_test(args.root.resolve()) if args.self_test else 0
        print(json.dumps({'definitions': count, 'mutation_tests': mutations,
                          'static_validation': 'passed', 'runtime_loading': 'not_tested'}))
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f'definition check failed: {error}\n')
