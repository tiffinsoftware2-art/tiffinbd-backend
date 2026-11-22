import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { resolveManualCustomer } from './manual-customer.util';

const base = {
  orderType: 'DELIVERY',
  items: [{ name: 'Tea', quantity: 1, price: 10 }],
};

async function errorsFor(extra: object) {
  const dto = plainToInstance(CreateManualOrderDto, { ...base, ...extra });
  return (await validate(dto)).map((e) => e.property);
}

describe('manual order customer details', () => {
  it('are required for a WhatsApp order', async () => {
    const props = await errorsFor({ source: 'WHATSAPP' });
    expect(props).toEqual(
      expect.arrayContaining(['customerName', 'customerPhone', 'customerAddress']),
    );
  });

  it.each(['FOODPANDA', 'PATHAO', 'FOODIE'])('are optional for %s', async (source) => {
    const props = await errorsFor({ source });
    expect(props).not.toContain('customerName');
    expect(props).not.toContain('customerPhone');
    expect(props).not.toContain('customerAddress');
  });

  it('become empty strings and a readable name for a platform order', () => {
    expect(resolveManualCustomer({ source: 'FOODPANDA' })).toEqual({
      name: 'Foodpanda customer',
      phone: '',
      address: '',
      notes: undefined,
    });
  });

  it('keeps what was typed', () => {
    const c = resolveManualCustomer({
      source: 'PATHAO',
      customerName: ' Rina ',
      customerPhone: '017',
    });
    expect(c.name).toBe('Rina');
    expect(c.phone).toBe('017');
  });
});
