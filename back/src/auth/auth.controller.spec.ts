import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            activateInvite: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            changePassword: jest.fn(),
            setRefreshTokenCookie: jest.fn(),
            clearRefreshTokenCookie: jest.fn(),
            extractRefreshTokenFromRequest: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
