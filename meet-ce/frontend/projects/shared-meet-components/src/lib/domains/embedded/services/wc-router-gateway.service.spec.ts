import { WcRouteName } from '../models/wc-route.model';
import { WcNavigator, WcRouterGateway } from './wc-router-gateway.service';

/**
 * Pure delegation seam between `NavigationService` and `WcRouterService` (see the class doc
 * comment for why it exists). `getHomeRoute` is the one this file adds, backing
 * `NavigationService.goBackToRoom`'s reuse of the registered home route (MEET-BRANCH-AUDIT-FINDINGS
 * A5, "bug 1"); the rest is exercised alongside it since none of it had coverage before.
 */
describe('WcRouterGateway', () => {
	let gateway: WcRouterGateway;
	let navigator: jasmine.SpyObj<WcNavigator>;

	beforeEach(() => {
		gateway = new WcRouterGateway();
		navigator = jasmine.createSpyObj<WcNavigator>('WcNavigator', ['navigate', 'navigateToInitial', 'getHomeRoute']);
	});

	describe('before a navigator registers (SPA/iframe mode)', () => {
		it('getHomeRoute() returns null', () => {
			expect(gateway.getHomeRoute()).toBeNull();
		});

		it('navigate() and navigateToInitial() resolve as no-ops', async () => {
			await expectAsync(
				gateway.navigate({ name: WcRouteName.MEETING, params: { roomId: 'room-1' } })
			).toBeResolved();
			await expectAsync(gateway.navigateToInitial()).toBeResolved();
		});
	});

	describe('once a navigator registers', () => {
		beforeEach(() => gateway.register(navigator));

		it('getHomeRoute() delegates to the navigator', () => {
			const homeRoute = { name: WcRouteName.MEETING, params: { roomId: 'room-1' } } as const;
			navigator.getHomeRoute.and.returnValue(homeRoute);

			expect(gateway.getHomeRoute()).toBe(homeRoute);
		});

		it('navigate() delegates to the navigator', async () => {
			const route = { name: WcRouteName.MEETING, params: { roomId: 'room-1' } } as const;
			navigator.navigate.and.resolveTo(undefined);

			await gateway.navigate(route);

			expect(navigator.navigate).toHaveBeenCalledOnceWith(route);
		});

		it('navigateToInitial() delegates to the navigator', async () => {
			navigator.navigateToInitial.and.resolveTo(undefined);

			await gateway.navigateToInitial();

			expect(navigator.navigateToInitial).toHaveBeenCalledOnceWith();
		});
	});
});
