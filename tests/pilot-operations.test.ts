import test from "node:test";
import assert from "node:assert/strict";
import {
  canManageSupplierOrders,
  canManageTeam,
  canSignDocuments,
  isInvitableRole,
  supplierOrderTotal,
} from "../lib/pilot-operations";

test("les rôles sensibles restent séparés", () => {
  assert.equal(canManageTeam("owner"), true);
  assert.equal(canManageTeam("admin"), true);
  assert.equal(canManageTeam("manager"), false);
  assert.equal(canManageTeam("worker"), false);
  assert.equal(canManageSupplierOrders("office"), true);
  assert.equal(canManageSupplierOrders("manager"), true);
  assert.equal(canManageSupplierOrders("worker"), false);
  assert.equal(canSignDocuments("accountant"), false);
  assert.equal(canSignDocuments("office"), true);
});

test("le propriétaire ne peut pas être attribué par invitation", () => {
  assert.equal(isInvitableRole("owner"), false);
  assert.equal(isInvitableRole("worker"), true);
  assert.equal(isInvitableRole("accountant"), true);
  assert.equal(isInvitableRole("invalid"), false);
});

test("le total fournisseur est calculé et arrondi", () => {
  assert.equal(supplierOrderTotal(3, 12.345), 37.04);
  assert.equal(supplierOrderTotal(-2, 10), 0);
  assert.equal(supplierOrderTotal(Number.NaN, 10), 0);
});
