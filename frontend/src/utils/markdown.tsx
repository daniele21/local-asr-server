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

export const renderMarkdown = (md: string): React.ReactNode[] => {
  if (!md) return [];
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

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

  lines.forEach((line, index) => {
    const trimmed = line.trim();

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

  flushList('end');
  return elements;
};
