type TreeNode = {
  id: string;
  url?: string;
  children?: TreeNode[];
};

/** 从完整树读取直接子项数量，避免搜索或文件夹过滤影响计数。 */
export function getDirectChildCounts(nodes: readonly TreeNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (items: readonly TreeNode[]) => {
    for (const node of items) {
      if (!node.url) counts.set(node.id, node.children?.length ?? 0);
      if (node.children) visit(node.children);
    }
  };
  visit(nodes);
  return counts;
}
