import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';

@Injectable()
export class ReadFileService {
  private readonly parser = new Parser();

  extract(filePath: string): string {
    const content = readFileSync(filePath, 'utf8');
    const ext = extname(filePath).toLowerCase();
    const language = this.getLanguage(ext);
    if (!language) return content;
    try {
      this.parser.setLanguage(language);
      const tree = this.parser.parse(content);
      const symbols = this.walkTree(tree.rootNode);
      return symbols.length > 0 ? symbols.join('\n') : content;
    } catch {
      return content;
    }
  }

  private getLanguage(
    ext: string,
  ): Parameters<Parser['setLanguage']>[0] | null {
    switch (ext) {
      case '.ts':
        return TypeScript.typescript;
      case '.tsx':
        return TypeScript.tsx;
      case '.js':
      case '.jsx':
        return JavaScript;
      default:
        return null;
    }
  }

  private walkTree(rootNode: Parser.SyntaxNode): string[] {
    const lines: string[] = [];
    for (const node of rootNode.children) {
      switch (node.type) {
        case 'import_statement':
          lines.push(node.text.replace(/\n\s*/g, ' '));
          break;
        case 'export_statement':
          lines.push(...this.processExport(node));
          break;
        case 'function_declaration':
          lines.push(this.formatFunction(node, ''));
          break;
        case 'class_declaration':
          lines.push(...this.formatClass(node, ''));
          break;
        case 'interface_declaration':
          lines.push(...this.formatInterface(node, ''));
          break;
        case 'type_alias_declaration':
          lines.push(this.formatTypeAlias(node, ''));
          break;
        case 'lexical_declaration':
          lines.push(this.formatLexical(node, ''));
          break;
      }
    }
    return lines;
  }

  private processExport(node: Parser.SyntaxNode): string[] {
    const lines: string[] = [];
    for (const child of node.children) {
      switch (child.type) {
        case 'function_declaration':
          lines.push(this.formatFunction(child, 'export '));
          break;
        case 'class_declaration':
          lines.push(...this.formatClass(child, 'export '));
          break;
        case 'interface_declaration':
          lines.push(...this.formatInterface(child, 'export '));
          break;
        case 'type_alias_declaration':
          lines.push(this.formatTypeAlias(child, 'export '));
          break;
        case 'lexical_declaration':
          lines.push(this.formatLexical(child, 'export '));
          break;
        case 'export_clause':
          lines.push(`export ${child.text}`);
          break;
      }
    }
    if (lines.length === 0) {
      const firstLine = node.text.split('\n')[0].trim();
      if (firstLine) lines.push(firstLine);
    }
    return lines;
  }

  private formatFunction(node: Parser.SyntaxNode, prefix: string): string {
    const name = node.childForFieldName('name')?.text ?? 'anonymous';
    const params = node.childForFieldName('parameters')?.text ?? '()';
    const returnType = node.childForFieldName('return_type')?.text ?? '';
    return `${prefix}function ${name}${params}${returnType}`;
  }

  private formatClass(node: Parser.SyntaxNode, prefix: string): string[] {
    const lines: string[] = [];
    const name = node.childForFieldName('name')?.text ?? 'Anonymous';
    lines.push(`${prefix}class ${name}`);
    const body = node.childForFieldName('body');
    if (body) {
      for (const member of body.children) {
        if (
          member.type === 'method_definition' ||
          member.type === 'public_field_definition'
        ) {
          const memberName = member.childForFieldName('name')?.text;
          if (memberName) {
            const params = member.childForFieldName('parameters')?.text ?? '';
            const returnType =
              member.childForFieldName('return_type')?.text ?? '';
            lines.push(`  ${memberName}${params}${returnType}`);
          }
        }
      }
    }
    return lines;
  }

  private formatInterface(node: Parser.SyntaxNode, prefix: string): string[] {
    const lines: string[] = [];
    const name = node.childForFieldName('name')?.text ?? 'Anonymous';
    lines.push(`${prefix}interface ${name}`);
    const body = node.childForFieldName('body');
    if (body) {
      for (const member of body.children) {
        if (member.type === 'property_signature') {
          const propName = member.childForFieldName('name')?.text;
          const propType = member.childForFieldName('type')?.text;
          if (propName) {
            lines.push(`  ${propName}${propType ? ': ' + propType : ''}`);
          }
        }
      }
    }
    return lines;
  }

  private formatTypeAlias(node: Parser.SyntaxNode, prefix: string): string {
    const name = node.childForFieldName('name')?.text ?? 'Unknown';
    const value = node.childForFieldName('value')?.text;
    return `${prefix}type ${name}${value ? ' = ' + value : ''}`;
  }

  private formatLexical(node: Parser.SyntaxNode, prefix: string): string {
    const declarator = node.children.find(
      (c) => c.type === 'variable_declarator',
    );
    if (!declarator) return `${prefix}${node.text.split('\n')[0].trim()}`;
    const name = declarator.childForFieldName('name')?.text ?? 'unknown';
    const typeAnn = declarator.childForFieldName('type')?.text;
    return `${prefix}const ${name}${typeAnn ? typeAnn : ''}`;
  }
}
