// Convert reference identifiers to accessible controls in every Markdown text node.
export function remarkCitations() {
  return (tree) => {
    function visit(parent) {
      if (!parent.children || ['link', 'code', 'inlineCode'].includes(parent.type)) return;
      const children = [];
      for (const node of parent.children) {
        if (node.type !== 'text') {
          visit(node);
          children.push(node);
          continue;
        }
        const regex = /\[((?:R|S|T)\d+(?:\s*[,，、]\s*(?:R|S|T)\d+)*)\]/g;
        let match,
          start = 0;
        while ((match = regex.exec(node.value))) {
          if (match.index > start)
            children.push({ type: 'text', value: node.value.slice(start, match.index) });
          for (const id of match[1].match(/(?:R|S|T)\d+/g))
            children.push({
              type: 'link',
              url: '#evidence-' + id,
              children: [{ type: 'text', value: id }],
            });
          start = regex.lastIndex;
        }
        if (start < node.value.length)
          children.push({ type: 'text', value: node.value.slice(start) });
      }
      parent.children = children;
    }
    visit(tree);
  };
}
