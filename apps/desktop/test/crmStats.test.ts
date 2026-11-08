import { assert, describe, it } from "@effect/vitest"
import {
  type Contact,
  ContactId,
  type Deal,
  DealId,
  emptyContactDetails,
  emptyDealDetails,
  emptyServiceDetails,
  type Pipeline,
  PipelineId,
  type Service,
  ServiceId,
  StageId
} from "@scope-bot/domain"
import {
  chanceOf,
  contactLineOf,
  duplicateIds,
  filterDeals,
  groupByDay,
  noDealFilters,
  priceLabel,
  salesOf,
  summarizeDeals,
  toCsv
} from "../renderer/src/crmStats.ts"

const now = new Date("2026-11-20T12:00:00.000Z")
const stage = (id: string, kind: "open" | "won" | "lost", probability: number) => ({
  id: StageId.make(id),
  name: id,
  kind,
  probability
})
const pipeline: Pipeline = {
  id: PipelineId.make("p"),
  name: "Sales",
  stages: [stage("new", "open", 10), stage("proposal", "open", 50), stage("won", "won", 100), stage("lost", "lost", 0)],
  createdAt: ""
}

const deal = (id: string, stageId: string, amount: number, extra: Partial<Deal> = {}): Deal => ({
  ...emptyDealDetails,
  id: DealId.make(id),
  title: id,
  pipelineId: pipeline.id,
  stageId: StageId.make(stageId),
  amount,
  createdAt: "2026-11-01T00:00:00.000Z",
  stageChangedAt: "2026-11-01T00:00:00.000Z",
  closedAt: null,
  ...extra
})

const contact = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({
  ...emptyContactDetails,
  id: ContactId.make(id),
  name,
  summary: null,
  createdAt: "",
  ...extra
})

describe("summarizeDeals", () => {
  const deals = [
    deal("a", "new", 1000),
    deal("b", "proposal", 2000, { probability: 80 }),
    deal("c", "won", 500, { closedAt: "2026-11-11T00:00:00.000Z" }),
    deal("d", "won", 700, { closedAt: "2026-10-05T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" }),
    deal("e", "lost", 300, { closedAt: "2026-11-02T00:00:00.000Z" })
  ]

  it("counts only open deals as open", () => {
    const summary = summarizeDeals(deals, pipeline, now)

    assert.strictEqual(summary.openAmount, 3000)
    assert.strictEqual(summary.openCount, 2)
  })

  it("weights by the deal's own chance, or else its stage's", () => {
    assert.strictEqual(summarizeDeals(deals, pipeline, now).weighted, 1000 * 0.1 + 2000 * 0.8)
  })

  it("counts wins of this month, the win rate and the median days to close", () => {
    const summary = summarizeDeals(deals, pipeline, now)

    assert.strictEqual(summary.wonThisMonth, 500)
    assert.strictEqual(summary.winRate, 67)
    assert.strictEqual(summary.medianDays, 7)
  })

  it("has no rate before anything closes", () => {
    const summary = summarizeDeals([deal("a", "new", 1)], pipeline, now)

    assert.isNull(summary.winRate)
    assert.isNull(summary.medianDays)
  })
})

describe("chanceOf", () => {
  it("prefers the deal's own chance, even when it is zero", () => {
    assert.strictEqual(chanceOf(deal("a", "new", 1, { probability: 0 }), pipeline.stages[0]), 0)
    assert.strictEqual(chanceOf(deal("a", "new", 1), pipeline.stages[0]), 10)
  })
})

describe("filterDeals", () => {
  const line = () => "Northwind · Anna"

  it("searches the title and the contact", () => {
    const deals = [deal("Website", "new", 1), deal("Logo", "new", 1)]

    assert.lengthOf(
      filterDeals(deals, { ...noDealFilters, search: "web" }, () => "", now),
      1
    )
    assert.lengthOf(filterDeals(deals, { ...noDealFilters, search: "north" }, line, now), 2)
  })

  it("separates people from employees", () => {
    const deals = [deal("a", "new", 1), deal("b", "new", 1, { ownerId: "nino" as Deal["ownerId"] })]

    assert.deepStrictEqual(
      filterDeals(deals, { ...noDealFilters, owner: "you" }, line, now).map((item) => item.title),
      ["a"]
    )
    assert.deepStrictEqual(
      filterDeals(deals, { ...noDealFilters, owner: "nino" }, line, now).map((item) => item.title),
      ["b"]
    )
  })

  it("finds deals closing this month and overdue ones", () => {
    const deals = [
      deal("soon", "new", 1, { closeDate: "2026-11-28" }),
      deal("late", "new", 1, { closeDate: "2026-11-02" })
    ]

    assert.lengthOf(filterDeals(deals, { ...noDealFilters, closes: "month" }, line, now), 2)
    assert.deepStrictEqual(
      filterDeals(deals, { ...noDealFilters, closes: "overdue" }, line, now).map((item) => item.title),
      ["late"]
    )
  })
})

describe("contacts", () => {
  it("reads a person with their company", () => {
    const company = contact("n", "Northwind", { kind: "company" })
    const anna = contact("a", "Anna", { companyId: company.id })

    assert.strictEqual(contactLineOf(anna.id, [company, anna]), "Northwind · Anna")
    assert.strictEqual(contactLineOf(company.id, [company, anna]), "Northwind")
    assert.strictEqual(contactLineOf(null, [company]), "")
  })

  it("finds the same number written differently, and ignores empty channels", () => {
    const channels = { phone: "+995 555 12-34-56", whatsapp: "", telegram: "" }
    const same = { phone: "995555123456", whatsapp: "", telegram: "" }

    const ids = duplicateIds([
      contact("a", "A", { channels }),
      contact("b", "B", { channels: same }),
      contact("c", "C")
    ])

    assert.deepStrictEqual([...ids].sort(), ["a", "b"])
  })
})

describe("services", () => {
  const service: Service = {
    ...emptyServiceDetails,
    id: ServiceId.make("s"),
    name: "Store",
    price: 18000,
    pricing: "from",
    createdAt: ""
  }

  it("counts won deals inside the period, sharing a deal between its services", () => {
    const other = ServiceId.make("o")
    const deals = [
      deal("a", "won", 1000, { serviceIds: [service.id], closedAt: "2026-11-10T00:00:00.000Z" }),
      deal("b", "won", 1000, { serviceIds: [service.id, other], closedAt: "2026-11-11T00:00:00.000Z" }),
      deal("c", "won", 9000, { serviceIds: [service.id], closedAt: "2026-01-01T00:00:00.000Z" }),
      deal("d", "new", 9000, { serviceIds: [service.id] })
    ]

    assert.deepStrictEqual(salesOf(service, deals, pipeline, now, 30), { sold: 2, revenue: 1500 })
  })

  it("reads the price by its model", () => {
    assert.strictEqual(priceLabel(service), "from 18,000")
    assert.strictEqual(priceLabel({ ...service, pricing: "monthly", price: 500 }), "500 /mo")
    assert.isNull(priceLabel({ ...service, price: null }))
  })
})

describe("toCsv", () => {
  it("quotes commas and quotes", () => {
    assert.strictEqual(toCsv([["a,b", 'say "hi"', 3]]), '"a,b","say ""hi""",3')
  })

  it("stops a cell from running as a formula", () => {
    assert.strictEqual(toCsv([["=HYPERLINK(1)"]]), "'=HYPERLINK(1)")
  })
})

describe("groupByDay", () => {
  it("puts the newest day and the newest entry first", () => {
    const activity = (id: string, createdAt: string) => ({
      id: id as never,
      kind: "note" as const,
      text: id,
      contactId: null,
      dealId: null,
      agentId: null,
      done: false,
      dueAt: null,
      createdAt
    })
    const groups = groupByDay(
      [
        activity("old", "2026-11-19T10:00:00"),
        activity("early", "2026-11-20T09:00:00"),
        activity("late", "2026-11-20T11:00:00")
      ],
      new Date("2026-11-20T12:00:00")
    )

    assert.deepStrictEqual(
      groups.map(([day, items]) => [day, items.map((item) => item.text)]),
      [
        ["Today", ["late", "early"]],
        ["Yesterday", ["old"]]
      ]
    )
  })
})
