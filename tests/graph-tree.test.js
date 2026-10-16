const assert = require("node:assert/strict");
const test = require("node:test");
const graph = require("../miniprogram/utils/graph");

test("buildCategoryGraph builds a self-centric tree with categories, recommended and contacts", () => {
  const profile = { nickname: "小明" };
  const categoryTree = [
    { id: "cat1", name: "大学", children: [{ id: "cat2", name: "同学", children: [] }] }
  ];
  const contacts = [
    { id: 1, name: "A", categoryIds: ["cat1"] },
    { id: 2, name: "B", categoryIds: ["cat2"] },
    { id: 3, name: "C", categoryIds: [] } // 未归类
  ];
  const recommended = ["朋友", "同事"];
  const g = graph.buildCategoryGraph(profile, categoryTree, contacts, recommended);

  // 节点：self + cat1 + cat2 + 2 推荐 + 未分类 = 6（联系人不再作为画布节点，点分支在抽屉里查看）
  assert.equal(g.nodes.length, 6);
  assert.ok(g.nodeById.get("self"));
  assert.equal(g.nodeById.get("self").kind, "self");
  assert.equal(g.nodeById.get("self").label, "小明");

  // 推荐分类以虚线节点出现
  const recFriend = g.nodeById.get("rec:朋友");
  assert.ok(recFriend && recFriend.recommended === true && recFriend.kind === "category");

  // 未分类为自动汇总节点
  assert.ok(g.nodeById.get("uncat") && g.nodeById.get("uncat").synthetic === true);

  // 边：self->cat1, cat1->cat2, self->2推荐, self->uncat = 5（联系人叶子不再连边）
  assert.equal(g.edges.length, 5);

  // 子节点索引（children）被正确填充
  assert.deepEqual(g.nodeById.get("self").children, ["cat1", "rec:朋友", "rec:同事", "uncat"]);
  assert.deepEqual(g.nodeById.get("cat1").children, ["cat2"]);
  assert.deepEqual(g.nodeById.get("cat2").children, []);
});

test("collectTreeIds returns the root and all descendants of a branch", () => {
  const profile = { nickname: "小明" };
  const categoryTree = [
    { id: "cat1", name: "大学", children: [{ id: "cat2", name: "同学", children: [{ id: "cat3", name: "本科", children: [] }] }] }
  ];
  const g = graph.buildCategoryGraph(profile, categoryTree, [], ["朋友"]);
  // 仅含 self + cat1 + cat2 + cat3 + 推荐，不含联系人
  assert.equal(g.nodes.length, 5);
  const ids = graph.collectTreeIds(g.nodeById, "cat1").sort();
  assert.deepEqual(ids, ["cat1", "cat2", "cat3"]);
  // 根不在图中时应返回空数组
  assert.deepEqual(graph.collectTreeIds(g.nodeById, "nope"), []);
});

test("radialLayout places self at center and keeps every node finite", () => {
  const profile = { nickname: "小明" };
  const categoryTree = [{ id: "cat1", name: "大学", children: [{ id: "cat2", name: "同学", children: [] }] }];
  const contacts = [
    { id: 1, name: "A", categoryIds: ["cat1"] },
    { id: 2, name: "B", categoryIds: ["cat2"] }
  ];
  const g = graph.buildCategoryGraph(profile, categoryTree, contacts, ["朋友"]);
  const out = graph.radialLayout(g.nodes, g.edges, { width: 360, height: 640 });
  const cx = 360 / 2, cy = 640 / 2;
  g.nodes.forEach((n) => {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `node ${n.id} position must be finite`);
  });
  assert.ok(Math.abs(g.nodeById.get("self").x - cx) < 0.001);
  assert.ok(Math.abs(g.nodeById.get("self").y - cy) < 0.001);
  // 子节点应分布在 self 周围（距中心 > 0）
  assert.ok(g.nodeById.get("cat1").x !== cx || g.nodeById.get("cat1").y !== cy);
  assert.ok(typeof out.cx === "number" && typeof out.cy === "number");
});
