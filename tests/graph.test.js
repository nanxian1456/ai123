const assert = require("node:assert/strict");
const test = require("node:test");
const graph = require("../miniprogram/utils/graph");

function sampleContacts() {
  return [
    { id: 1, name: "张三", organization: "云帆科技", city: "杭州", tags: ["同事"] },
    { id: 2, name: "李四", organization: "云帆科技", city: "上海", tags: ["合作伙伴"] },
    { id: 3, name: "王五", organization: "示例工作室", city: "杭州", tags: ["朋友"] }
  ];
}
function sampleRelationships() {
  return [
    { id: 1, sourceId: 1, targetId: 2, type: "同事", note: "" },
    { id: 2, sourceId: 1, targetId: 3, type: "朋友", note: "大学同学" }
  ];
}

test("buildGraph derives person/org/city nodes and the right edge counts", () => {
  const g = graph.buildGraph(sampleContacts(), sampleRelationships());
  assert.equal(g.nodes.filter((n) => n.kind === "person").length, 3);
  assert.equal(g.nodes.filter((n) => n.kind === "org").length, 2); // 云帆科技、示例工作室
  assert.equal(g.nodes.filter((n) => n.kind === "city").length, 2); // 杭州、上海
  assert.equal(g.edges.filter((e) => e.kind === "relation").length, 2);
  // 归属边：3 个单位 + 3 个城市（杭州重复出现但只产生各自连线）= 6
  assert.equal(g.edges.filter((e) => e.kind === "affiliation").length, 6);
  // 张三：2 条关系 + 单位 + 城市 = 4 度
  assert.equal(g.nodeById.get("p1").degree, 4);
});

test("buildGraph skips dangling relationships whose endpoints are missing", () => {
  const g = graph.buildGraph(sampleContacts(), [{ id: 9, sourceId: 1, targetId: 99, type: "朋友" }]);
  assert.equal(g.edges.filter((e) => e.kind === "relation").length, 0);
});

test("stepForce keeps positions finite and spreads nodes apart", () => {
  const g = graph.buildGraph(sampleContacts(), sampleRelationships());
  graph.initPositions(g.nodes, 360, 640);
  const pairs = graph.buildEdgePairs(g.nodes, g.edges);
  let movement = 0;
  for (let i = 0; i < 220; i += 1) movement = graph.stepForce(g.nodes, pairs, { width: 360, height: 640 });
  g.nodes.forEach((n) => assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), "position must stay finite"));
  const xs = g.nodes.map((n) => n.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  assert.ok(spread > 30, `nodes should spread out, got ${spread}`);
  assert.ok(movement >= 0, "movement should be a non-negative number");
});

test("neighborsWithin and shortestPath work on a linear chain", () => {
  const nodes = [
    { id: "a", kind: "person", label: "a", degree: 0 },
    { id: "b", kind: "person", label: "b", degree: 0 },
    { id: "c", kind: "person", label: "c", degree: 0 }
  ];
  const edges = [
    { id: "e1", source: "a", target: "b", kind: "relation", type: "x" },
    { id: "e2", source: "b", target: "c", kind: "relation", type: "x" }
  ];
  const adj = graph.buildAdjacency(nodes, edges);
  const within1 = graph.neighborsWithin(adj, "a", 1);
  assert.deepEqual([...within1].sort(), ["a", "b"]);
  assert.deepEqual(graph.shortestPath(adj, "a", "c"), ["a", "b", "c"]);
  assert.equal(graph.shortestPath(adj, "a", "z"), null);
  assert.deepEqual(graph.shortestPath(adj, "a", "a"), ["a"]);
});

test("degreeRank sorts by degree descending and caps at topN", () => {
  const g = graph.buildGraph(sampleContacts(), sampleRelationships());
  const rank = graph.degreeRank(g.nodes, 10);
  assert.ok(rank.length <= 10);
  for (let i = 1; i < rank.length; i += 1) assert.ok(rank[i - 1].degree >= rank[i].degree);
  assert.equal(rank[0].id, "p1"); // 张三度数最高
});

test("node type colors are stable and distinct per kind", () => {
  assert.equal(graph.KIND_COLORS.person, "#2563eb");
  assert.equal(graph.KIND_COLORS.org, "#18a88e");
  assert.equal(graph.KIND_COLORS.city, "#d89134");
  assert.notEqual(graph.KIND_COLORS.person, graph.KIND_COLORS.org);
});
