import { OrdersService } from './orders.service';
import { DiscountType, OrderStatus } from './entities/order.entity';
import type { CreateManualOrderDto } from './dto/create-manual-order.dto';
import type { UpdateManualOrderDto } from './dto/update-manual-order.dto';
import type { JwtPayload } from '../auth/auth.service';
import { UserRole } from '../../common/enums/user-role.enum';

// Exercises the "Exclude VAT" checkbox path end to end at the service layer:
// the frontend (orders/new/page.tsx) sends `vatPercent: 0` when the checkbox
// is checked, omits the field entirely otherwise. Before this fix, both
// CreateManualOrderDto/UpdateManualOrderDto lacked a `vatPercent` field (so
// NestJS's ValidationPipe would strip it before it ever reached the
// service), and even if it had reached the service, createManualOrder/
// updateManualOrder never read it — VAT was always derived purely from
// manual_order_config / the existing snapshot. See ADR-005 and
// tiffinbd-context/services/frontend/features/manual-order/manual-order.md.
describe('OrdersService — VAT override (Exclude VAT checkbox)', () => {
  function makeService() {
    const repo = {
      create: jest.fn(async (_unified, _branchId, pricing) => ({
        id: 'order-1',
        externalId: 'MANUAL-AAAAAAAA',
        source: 'WEBSITE',
        orderType: 'DELIVERY',
        status: OrderStatus.PENDING,
        branchId: 'branch-1',
        branchName: 'Main Branch',
        customer: { name: 'A', phone: '01700000000', address: 'X' },
        items: [{ name: 'Item', quantity: 1, price: 100 }],
        totalAmount: pricing.totalAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updateManual: jest.fn(async (order, _dto, pricing) => ({
        ...order,
        vatPercent: pricing.vatPercent,
        vatAmount: pricing.vatAmount,
        totalAmount: pricing.totalAmount,
      })),
      findById: jest.fn(),
    };
    const settings = {
      getManualOrderConfig: jest.fn(async () => ({
        vatPercent: 5,
        deliveryCharge: 27,
        platformFee: 3,
        vatExcludedSources: null,
      })),
      // No source is configured as VAT-excluded in this block — it exercises
      // the per-order checkbox alone. The per-source rule has its own block.
      vatExcludedFor: jest.fn(() => false),
    };
    const branchRepo = {
      findOneBy: jest.fn(async () => ({ id: 'branch-1', name: 'Main Branch' })),
    };
    const gateway = { emit: jest.fn() };
    const events = { publish: jest.fn(async () => undefined) };
    const mail = {};

    const service = new OrdersService(
      repo as any,
      events as any,
      gateway as any,
      mail as any,
      settings as any,
      branchRepo as any,
    );
    return { service, repo, settings };
  }

  const actor: JwtPayload = {
    sub: 'user-1',
    role: UserRole.MANAGER,
    branchId: null,
  } as JwtPayload;

  const baseCreateDto: CreateManualOrderDto = {
    source: 'WEBSITE',
    branchId: 'branch-1',
    orderType: 'DELIVERY',
    customerName: 'A',
    customerPhone: '01700000000',
    customerAddress: 'X',
    items: [{ name: 'Item', quantity: 1, price: 100 }],
  } as CreateManualOrderDto;

  it('createManualOrder: uses manual_order_config VAT% when excludeVat is omitted (unchanged behavior)', async () => {
    const { service, repo } = makeService();
    await service.createManualOrder(baseCreateDto, actor);
    const pricing = repo.create.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(5);
    expect(pricing.vatAmount).toBe(5); // 100 * 5%
  });

  it('createManualOrder: honors an explicit excludeVat override (Exclude VAT → 0)', async () => {
    const { service, repo } = makeService();
    await service.createManualOrder(
      { ...baseCreateDto, excludeVat: true },
      actor,
    );
    const pricing = repo.create.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(0);
    expect(pricing.vatAmount).toBe(0);
  });

  it('updateManualOrder: keeps the existing snapshot when excludeVat is omitted (unchanged behavior)', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: 8, // already snapshotted at 8% from a prior edit/creation
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    const dto: UpdateManualOrderDto = {
      source: 'WEBSITE',
      orderType: 'DELIVERY',
      customerName: 'A',
      customerPhone: '01700000000',
      customerAddress: 'X',
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    } as UpdateManualOrderDto;

    await service.updateManualOrder('order-1', dto, actor);
    const pricing = repo.updateManual.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(8);
  });

  it('updateManualOrder: an explicit excludeVat override (Exclude VAT → 0) takes priority over the existing snapshot', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: 8,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    const dto: UpdateManualOrderDto = {
      source: 'WEBSITE',
      orderType: 'DELIVERY',
      customerName: 'A',
      customerPhone: '01700000000',
      customerAddress: 'X',
      items: [{ name: 'Item', quantity: 1, price: 100 }],
      excludeVat: true,
    } as UpdateManualOrderDto;

    await service.updateManualOrder('order-1', dto, actor);
    const pricing = repo.updateManual.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(0);
    expect(pricing.vatAmount).toBe(0);
  });

  it('updateManualOrder: first edit of an integrated order (no snapshot yet) still seeds from manual_order_config when excludeVat is omitted', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: null,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    const dto: UpdateManualOrderDto = {
      source: 'WEBSITE',
      orderType: 'DELIVERY',
      customerName: 'A',
      customerPhone: '01700000000',
      customerAddress: 'X',
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    } as UpdateManualOrderDto;

    await service.updateManualOrder('order-1', dto, actor);
    const pricing = repo.updateManual.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(5); // from manual_order_config
  });
});

// Per-source VAT exclusion (ADR-005 Addendum 6): manual_order_config carries a
// list of sources whose orders default to VAT-excluded. The client's excludeVat
// boolean, when present, always wins — including `false`, which is the whole
// reason the old `vatPercent: 0` convention had to go: it could express
// "exclude" but never "include anyway".
describe('OrdersService — per-source VAT exclusion', () => {
  function makeService(vatExcludedSources: string | null) {
    const repo = {
      create: jest.fn(async (_unified, _branchId, pricing) => ({
        id: 'order-1',
        totalAmount: pricing.totalAmount,
        vatPercent: pricing.vatPercent,
        vatAmount: pricing.vatAmount,
      })),
      updateManual: jest.fn(async (order, _dto, pricing) => ({
        ...order,
        vatPercent: pricing.vatPercent,
        vatAmount: pricing.vatAmount,
      })),
      findById: jest.fn(),
    };
    const config = {
      vatPercent: 5,
      deliveryCharge: 27,
      platformFee: 3,
      vatExcludedSources,
    };
    const settings = {
      getManualOrderConfig: jest.fn(async () => config),
      // Mirrors SettingsService.vatExcludedFor, which delegates to the
      // separately-tested pure rule in settings/vat-exclusion.ts.
      vatExcludedFor: jest.fn((c: { vatExcludedSources: string | null }, source: string) =>
        c.vatExcludedSources
          ? (JSON.parse(c.vatExcludedSources) as string[]).includes(source)
          : false,
      ),
    };
    const branchRepo = {
      findOneBy: jest.fn(async () => ({ id: 'branch-1', name: 'Main Branch' })),
    };

    const service = new OrdersService(
      repo as any,
      { publish: jest.fn(async () => undefined) } as any,
      { emit: jest.fn() } as any,
      {} as any,
      settings as any,
      branchRepo as any,
    );
    return { service, repo };
  }

  const actor: JwtPayload = {
    sub: 'user-1',
    role: UserRole.MANAGER,
    branchId: null,
  } as JwtPayload;

  const createDto = (
    over: Partial<CreateManualOrderDto> = {},
  ): CreateManualOrderDto =>
    ({
      source: 'FOODPANDA',
      branchId: 'branch-1',
      orderType: 'DELIVERY',
      customerName: 'A',
      customerPhone: '01700000000',
      customerAddress: 'X',
      items: [{ name: 'Item', quantity: 1, price: 100 }],
      ...over,
    }) as CreateManualOrderDto;

  const updateDto = (
    over: Partial<UpdateManualOrderDto> = {},
  ): UpdateManualOrderDto =>
    ({
      source: 'FOODPANDA',
      orderType: 'DELIVERY',
      customerName: 'A',
      customerPhone: '01700000000',
      customerAddress: 'X',
      items: [{ name: 'Item', quantity: 1, price: 100 }],
      ...over,
    }) as UpdateManualOrderDto;

  it('createManualOrder: zeroes VAT when the source is excluded and the client is silent', async () => {
    const { service, repo } = makeService('["FOODPANDA"]');
    await service.createManualOrder(createDto(), actor);
    const pricing = repo.create.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(0);
    expect(pricing.vatAmount).toBe(0);
  });

  it('createManualOrder: applies the configured rate when the client explicitly opts in', async () => {
    const { service, repo } = makeService('["FOODPANDA"]');
    await service.createManualOrder(createDto({ excludeVat: false }), actor);
    const pricing = repo.create.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(5);
    expect(pricing.vatAmount).toBe(5); // 100 * 5%
  });

  it('createManualOrder: zeroes VAT when the client excludes a non-excluded source', async () => {
    const { service, repo } = makeService('["PATHAO"]');
    await service.createManualOrder(createDto({ excludeVat: true }), actor);
    expect(repo.create.mock.calls[0][2].vatPercent).toBe(0);
  });

  it('createManualOrder: applies the configured rate when no source is excluded', async () => {
    const { service, repo } = makeService(null);
    await service.createManualOrder(createDto(), actor);
    expect(repo.create.mock.calls[0][2].vatPercent).toBe(5);
  });

  it('updateManualOrder: recomputes VAT to 0 when an order is edited into an excluded source', async () => {
    const { service, repo } = makeService('["FOODPANDA"]');
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: 5,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    await service.updateManualOrder('order-1', updateDto(), actor);
    const pricing = repo.updateManual.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(0);
    expect(pricing.vatAmount).toBe(0);
  });

  it('updateManualOrder: keeps the existing snapshot when the source is not excluded', async () => {
    const { service, repo } = makeService('["PATHAO"]');
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: 15,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    await service.updateManualOrder(
      'order-1',
      updateDto({ source: 'WHATSAPP' }),
      actor,
    );
    expect(repo.updateManual.mock.calls[0][2].vatPercent).toBe(15);
  });

  it('updateManualOrder: never rewrites a real snapshot, even when Settings has since changed', async () => {
    // config.vatPercent is 5 here; the order was placed at 10 and must stay 10.
    const { service, repo } = makeService(null);
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: 10,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    await service.updateManualOrder(
      'order-1',
      updateDto({ source: 'WHATSAPP', excludeVat: false }),
      actor,
    );
    const pricing = repo.updateManual.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(10);
    expect(pricing.vatAmount).toBe(10);
  });

  it('updateManualOrder: re-including a 0-VAT order applies the current configured rate', async () => {
    const { service, repo } = makeService(null);
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: 0, // placed VAT-excluded — 0 is the absence of a rate, not a rate
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    await service.updateManualOrder(
      'order-1',
      updateDto({ source: 'WHATSAPP', excludeVat: false }),
      actor,
    );
    const pricing = repo.updateManual.mock.calls[0][2];
    expect(pricing.vatPercent).toBe(5);
    expect(pricing.vatAmount).toBe(5);
  });

  it('updateManualOrder: re-saving a 0-VAT order with the box still ticked keeps it at 0', async () => {
    const { service, repo } = makeService(null);
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: 0,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    await service.updateManualOrder(
      'order-1',
      updateDto({ source: 'WHATSAPP', excludeVat: true }),
      actor,
    );
    expect(repo.updateManual.mock.calls[0][2].vatPercent).toBe(0);
  });

  it('updateManualOrder: seeds the configured rate on first edit of a never-snapshotted order', async () => {
    const { service, repo } = makeService('["PATHAO"]');
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      vatPercent: null,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    await service.updateManualOrder(
      'order-1',
      updateDto({ source: 'WEBSITE' }),
      actor,
    );
    expect(repo.updateManual.mock.calls[0][2].vatPercent).toBe(5);
  });
});

// Regression coverage for "Settle/Update still allowed after archive": both
// direct archiving and an approved delete request set the same `archivedAt`
// column (approveDeleteRequest() calls the same repo.archive()), and were
// meant to freeze an order the same way completeOrder() already does (see
// its `if (order.archivedAt)` check) — but settleOrder()/updateManualOrder()
// never got the matching guard.
describe('OrdersService — archived orders are immutable', () => {
  function makeService() {
    const repo = {
      findById: jest.fn(),
      updateManual: jest.fn(),
      settle: jest.fn(),
    };
    const gateway = { emit: jest.fn() };
    const events = { publish: jest.fn(async () => undefined) };
    const settings = {};
    const branchRepo = {};
    const mail = {};

    const service = new OrdersService(
      repo as any,
      events as any,
      gateway as any,
      mail as any,
      settings as any,
      branchRepo as any,
    );
    return { service, repo };
  }

  const actor: JwtPayload = {
    sub: 'user-1',
    role: UserRole.MANAGER,
    branchId: null,
  } as JwtPayload;

  it('settleOrder: rejects an archived, escalated order', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      status: OrderStatus.ESCALATED,
      settledAt: null,
      archivedAt: new Date(),
    });

    await expect(
      service.settleOrder('order-1', 'Refunded', actor),
    ).rejects.toThrow('Order is already archived');
    expect(repo.settle).not.toHaveBeenCalled();
  });

  it('updateManualOrder: rejects an archived order', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValueOnce({
      id: 'order-1',
      branchId: null,
      isCompleted: false,
      archivedAt: new Date(),
      vatPercent: 8,
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    });
    const dto: UpdateManualOrderDto = {
      source: 'WEBSITE',
      orderType: 'DELIVERY',
      customerName: 'A',
      customerPhone: '01700000000',
      customerAddress: 'X',
      items: [{ name: 'Item', quantity: 1, price: 100 }],
    } as UpdateManualOrderDto;

    await expect(
      service.updateManualOrder('order-1', dto, actor),
    ).rejects.toThrow('Order is already archived');
    expect(repo.updateManual).not.toHaveBeenCalled();
  });
});
