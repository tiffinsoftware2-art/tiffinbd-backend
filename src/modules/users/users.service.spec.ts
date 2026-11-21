import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';
import { UsersService } from './users.service';

type Target = { id: string; role: UserRole } | null;

function setup(opts: { user?: Target; hasActivity?: boolean } = {}) {
  const user = 'user' in opts ? opts.user : { id: 'u-2', role: UserRole.STAFF };
  const repo = {
    findByIdForWrite: jest.fn().mockResolvedValue(user),
    hasActivity: jest.fn().mockResolvedValue(opts.hasActivity ?? false),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const auth = { revokeAllSessions: jest.fn().mockResolvedValue(undefined) };
  const devices = { unregister: jest.fn().mockResolvedValue(undefined) };
  const service = new UsersService(
    repo as never,
    auth as never,
    {} as never,
    devices as never,
    {} as never,
  );
  return { service, repo, auth, devices };
}

const admin = { sub: 'admin-1', role: UserRole.ADMIN } as never;

describe('UsersService.remove', () => {
  it('refuses to delete your own account', async () => {
    const { service, repo } = setup();
    await expect(service.remove('admin-1', admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('404s when the user does not exist', async () => {
    const { service } = setup({ user: null });
    await expect(service.remove('missing', admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to delete a user of equal or higher role', async () => {
    const { service, repo } = setup({
      user: { id: 'u-2', role: UserRole.ADMIN },
    });
    await expect(service.remove('u-2', admin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('refuses with a 409 when the user has order or audit history', async () => {
    const { service, repo, auth, devices } = setup({ hasActivity: true });
    await expect(service.remove('u-2', admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
    expect(devices.unregister).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('deletes a user with no activity and clears their sessions and devices', async () => {
    const { service, repo, auth, devices } = setup();
    await expect(service.remove('u-2', admin)).resolves.toEqual({
      message: 'User deleted',
    });
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('u-2');
    expect(devices.unregister).toHaveBeenCalledWith('u-2');
    expect(repo.remove).toHaveBeenCalledTimes(1);
  });
});
