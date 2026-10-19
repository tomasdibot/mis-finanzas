// npm test   (invented data only)
import { test } from "node:test";
import assert from "node:assert/strict";
import rules from "../web/rules.js";
import { withPersonal } from "../web/lib/personal.js";
import { enrich, enrichIn } from "../web/lib/model.js";
import { paymentRows } from "../web/lib/normalize.js";

const ME = 111;
const pay = (over) => ({ id: 1, operation_type: "regular_payment", status: "approved", payment_type_id: "account_money",
  payment_method_id: "account_money", date_created: "2026-09-10T12:00:00.000-03:00", transaction_amount: 500,
  transaction_details: { total_paid_amount: 500, net_received_amount: 500 }, collector_id: 999, refunds: [], ...over });
const out = (p, r, notes) => enrich(paymentRows(p, ME), r, {}, notes)[0];

test("the Template's rules are never changed by personal rules", () => {
  const before = JSON.stringify(rules);
  withPersonal(rules, [{ kind: "word", match: "heladeria ejemplo", value: "Ocio" }, { kind: "name", match: "A", value: "B" }]);
  assert.equal(JSON.stringify(rules), before);
});

test("a merchant can be renamed; its movements keep the automatic name underneath", () => {
  const p = pay({ statement_descriptor: "MERPAGO*KIOSCOEJEMPLO", description: "Pago Online" });
  assert.equal(out(p, withPersonal(rules)).merchant, "Kioscoejemplo");
  const r = out(p, withPersonal(rules, [{ kind: "name", match: "Kioscoejemplo", value: "El kiosco de la esquina" }]));
  assert.deepEqual([r.merchant, r.merchant_auto], ["El kiosco de la esquina", "Kioscoejemplo"]);
});

test("a personal word picks the category, before the Template's words", () => {
  const p = pay({ statement_descriptor: "MERPAGO*HELADOSEJEMPLO", description: "Pago Online" });
  assert.equal(out(p, withPersonal(rules)).category, "Comida afuera y delivery");   // "helad" in the Template
  assert.equal(out(p, withPersonal(rules, [{ kind: "word", match: "heladosejemplo", value: "Regalos" }])).category, "Regalos");
});

test("a merchant category rule follows the merchant's shown name", () => {
  const p = pay({ statement_descriptor: "MERPAGO*KIOSCOEJEMPLO", description: "Pago Online" });
  const R = withPersonal(rules, [{ kind: "name", match: "Kioscoejemplo", value: "Kiosco" }]);
  assert.equal(out(p, R, { "m:Kiosco": { category: "Regalos" } }).category, "Regalos");
});

test("money in: personal words and names apply too", () => {
  const p = pay({ collector_id: ME, operation_type: "money_transfer", payer: { first_name: "PERSONA", last_name: "EJEMPLO" },
    description: "cuota club" });
  const [r] = enrichIn(paymentRows(p, ME), withPersonal(rules, [{ kind: "name", match: "Persona Ejemplo", value: "Ana" },
    { kind: "word_in", match: "cuota club", value: "Otros ingresos" }]), { "1:payment": { note: "cuota club" } });
  assert.deepEqual([r.merchant, r.category], ["Ana", "Otros ingresos"]);
});
