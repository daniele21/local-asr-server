import React from 'react';

// Helper to parse inline formatting (bold, italic)
export const parseInlineMarkdown = (text: string): React.ReactNode => {
  const regex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3/g;
  let lastIndex = 0;
  let match;
  const result: React.ReactNode[] = [];

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      result.push(text.slice(lastIndex, matchIndex));
    }

    if (match[1]) {
      // Bold
      result.push(
        <strong key={matchIndex} className="font-semibold text-text-primary">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Italic
      result.push(
        <em key={matchIndex} className="italic text-text-primary">
          {match[4]}
        </em>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return <>{result}</>;
};

const parseTable = (tableLines: string[], keyPrefix: string | number): React.ReactNode | null => {
  if (tableLines.length < 2) return null;

  const firstLine = tableLines[0];
  const secondLine = tableLines[1];

  // The second line must be a separator line
  const cleanSecond = secondLine.replace(/\|/g, '').trim();
  const isSecondSeparator = cleanSecond.length > 0 && /^[\s\-\+:]+$/.test(cleanSecond);
  if (!isSecondSeparator) return null;

  const splitRow = (line: string): string[] => {
    const trimmed = line.trim();
    let content = trimmed;
    if (content.startsWith('|')) content = content.slice(1);
    if (content.endsWith('|')) content = content.slice(0, -1);
    return content.split('|').map(c => c.trim());
  };

  const headerCells = splitRow(firstLine);
  const separatorCells = splitRow(secondLine);

  const alignCells = separatorCells.map(cell => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return 'left';
  });

  const rowsData: string[][] = [];
  for (let i = 2; i < tableLines.length; i++) {
    rowsData.push(splitRow(tableLines[i]));
  }

  return (
    <div key={`table-wrapper-${keyPrefix}`} className="overflow-x-auto my-4 rounded-lg border border-border-subtle bg-bg-surface/30">
      <table className="min-w-full divide-y divide-border-subtle text-sm">
        <thead className="bg-bg-surface/80">
          <tr>
            {headerCells.map((cell, idx) => {
              const align = alignCells[idx] || 'left';
              return (
                <th
                  key={`th-${idx}`}
                  style={{ textAlign: align as any }}
                  className="px-4 py-2 text-xs font-semibold text-text-primary uppercase tracking-wider border-b border-border-subtle"
                >
                  {parseInlineMarkdown(cell)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-bg-elevated/40">
          {rowsData.map((row, rowIdx) => (
            <tr key={`tr-${rowIdx}`} className="hover:bg-bg-hover/20 transition-colors">
              {headerCells.map((_, colIdx) => {
                const cell = row[colIdx] || '';
                const align = alignCells[colIdx] || 'left';
                return (
                  <td
                    key={`td-${rowIdx}-${colIdx}`}
                    style={{ textAlign: align as any }}
                    className="px-4 py-2 text-text-secondary border-b border-border-subtle text-xs md:text-sm"
                  >
                    {parseInlineMarkdown(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const renderMarkdown = (md: string): React.ReactNode[] => {
  if (!md) return [];
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let tableLines: string[] = [];

  const flushList = (keyPrefix: string | number) => {
    if (listItems.length > 0) {
      elements.push(
        <ul
          key={`list-${keyPrefix}`}
          className="list-disc pl-5 text-sm text-text-secondary leading-relaxed flex flex-col gap-1.5 my-2"
        >
          {[...listItems]}
        </ul>
      );
      listItems.length = 0;
    }
  };

  const flushTable = (keyPrefix: string | number) => {
    if (tableLines.length > 0) {
      const tableElement = parseTable(tableLines, keyPrefix);
      if (tableElement) {
        elements.push(tableElement);
      } else {
        // Fallback: render table lines as normal paragraphs
        tableLines.forEach((tLine, tIdx) => {
          elements.push(
            <p
              key={`invalid-table-${keyPrefix}-${tIdx}`}
              className="text-sm text-text-secondary leading-relaxed mb-2 whitespace-pre-wrap"
            >
              {parseInlineMarkdown(tLine)}
            </p>
          );
        });
      }
      tableLines.length = 0;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // If it's a table line, accumulate it
    if (trimmed.startsWith('|')) {
      flushList(index);
      tableLines.push(line);
      return;
    }

    flushTable(index);

    // Check for Horizontal Rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushList(index);
      elements.push(
        <hr key={index} className="border-border-subtle my-4" />
      );
      return;
    }

    if (line.startsWith('# ')) {
      flushList(index);
      elements.push(
        <h1
          key={index}
          className="text-xl font-bold mt-4 mb-2 text-text-primary border-b border-border-subtle pb-2"
        >
          {parseInlineMarkdown(line.substring(2))}
        </h1>
      );
      return;
    }

    if (line.startsWith('## ')) {
      flushList(index);
      elements.push(
        <h2
          key={index}
          className="text-lg font-semibold mt-3 mb-2 text-text-primary border-b border-border-subtle pb-1"
        >
          {parseInlineMarkdown(line.substring(3))}
        </h2>
      );
      return;
    }

    if (line.startsWith('### ')) {
      flushList(index);
      elements.push(
        <h3
          key={index}
          className="text-sm font-semibold mt-2.5 mb-1.5 text-text-primary"
        >
          {parseInlineMarkdown(line.substring(4))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.substring(2);
      listItems.push(
        <li key={`li-${index}`} className="text-text-secondary">
          {parseInlineMarkdown(itemText)}
        </li>
      );
      return;
    }

    flushList(index);

    if (!trimmed) {
      elements.push(<div key={index} className="h-2" />);
    } else {
      elements.push(
        <p
          key={index}
          className="text-sm text-text-secondary leading-relaxed mb-2 whitespace-pre-wrap"
        >
          {parseInlineMarkdown(line)}
        </p>
      );
    }
  });

  flushTable('end');
  flushList('end');
  return elements;
};
