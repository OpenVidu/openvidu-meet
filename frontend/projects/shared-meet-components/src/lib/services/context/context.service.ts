import { Injectable } from '@angular/core';
import { jwtDecode } from 'jwt-decode';
import { ApplicationMode, ContextData, Edition } from '../../models/context.model';
import { LoggerService } from 'openvidu-components-angular';
import { AuthMode, HttpService, ParticipantRole } from 'projects/shared-meet-components/src/public-api';

@Injectable({
	providedIn: 'root'
})
/**
 * Service to manage the context of the application, including embedded mode and token management.
 */
export class ContextService {
	private context: ContextData = {
		mode: ApplicationMode.STANDALONE,
		edition: Edition.CE,
		version: '',
		parentDomain: '',
		securityPreferences: undefined,
		openviduLogoUrl: '',
		backgroundImageUrl: '',
		roomId: '',
		secret: '',
		participantName: '',
		participantToken: '',
		participantRole: ParticipantRole.PUBLISHER,
		participantPermissions: {
			canRecord: false,
			canChat: false,
			canChangeVirtualBackground: false,
			canPublishScreen: false
		},
		recordingPermissions: {
			canRetrieveRecordings: true,
			canDeleteRecordings: false
		},
		leaveRedirectUrl: ''
	};

	private log;

	/**
	 * Initializes a new instance of the ContextService class.
	 */
	constructor(
		private loggerService: LoggerService,
		private httpService: HttpService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - ContextService');
	}

	setApplicationMode(mode: ApplicationMode): void {
		this.log.d('Setting application mode', mode);
		this.context.mode = mode;
	}

	isEmbeddedMode(): boolean {
		return this.context.mode === ApplicationMode.EMBEDDED;
	}

	isStandaloneMode(): boolean {
		return this.context.mode === ApplicationMode.STANDALONE;
	}

	getEdition(): Edition {
		return this.context.edition;
	}

	setVersion(version: string): void {
		this.context.version = version;
	}

	getVersion(): string {
		return this.context.version;
	}

	setParentDomain(parentDomain: string): void {
		this.context.parentDomain = parentDomain;
	}

	getParentDomain(): string {
		return this.context.parentDomain;
	}

	setOpenViduLogoUrl(openviduLogoUrl: string): void {
		this.context.openviduLogoUrl = openviduLogoUrl;
	}

	getOpenViduLogoUrl(): string {
		return this.context.openviduLogoUrl;
	}

	setBackgroundImageUrl(backgroundImageUrl: string): void {
		this.context.backgroundImageUrl = backgroundImageUrl;
	}

	getBackgroundImageUrl(): string {
		return this.context.backgroundImageUrl;
	}

	async canUsersCreateRooms(): Promise<boolean> {
		await this.getSecurityPreferences();
		return this.context.securityPreferences!.roomCreationPolicy.allowRoomCreation;
	}

	async isAuthRequiredToCreateRooms(): Promise<boolean> {
		await this.getSecurityPreferences();
		const requireAuthentication = this.context.securityPreferences!.roomCreationPolicy.requireAuthentication;
		return requireAuthentication !== undefined && requireAuthentication;
	}

	async getAuthModeToEnterRoom(): Promise<AuthMode> {
		await this.getSecurityPreferences();
		return this.context.securityPreferences!.authentication.authMode;
	}

	setRoomId(roomId: string): void {
		this.context.roomId = roomId;
	}

	getRoomId(): string {
		return this.context.roomId;
	}

	setSecret(secret: string): void {
		this.context.secret = secret;
	}

	getSecret(): string {
		return this.context.secret;
	}

	setParticipantName(participantName: string): void {
		this.context.participantName = participantName;
	}

	getParticipantName(): string {
		return this.context.participantName;
	}

	/**
	 * Sets the token for the current session.
	 * @param token - A string representing the token.
	 */
	setParticipantToken(token: string): void {
		try {
			const decodedToken = this.getValidDecodedToken(token);
			this.context.participantToken = token;
			this.context.participantPermissions = decodedToken.metadata.permissions;
			this.context.participantRole = decodedToken.metadata.role;
		} catch (error: any) {
			this.log.e('Error setting token in context', error);
			throw new Error('Error setting token', error);
		}
	}

	getParticipantToken(): string {
		return this.context.participantToken;
	}

	setParticipantRole(participantRole: ParticipantRole): void {
		this.context.participantRole = participantRole;
	}

	getParticipantRole(): ParticipantRole {
		return this.context.participantRole;
	}

	isModeratorParticipant(): boolean {
		return this.context.participantRole === ParticipantRole.MODERATOR;
	}

	canRecord(): boolean {
		return this.context.participantPermissions.canRecord;
	}

	canChat(): boolean {
		return this.context.participantPermissions.canChat;
	}

	setRecordingPermissionsFromToken(token: string): void {
		try {
			const decodedToken = this.getValidDecodedToken(token);
			this.context.recordingPermissions = decodedToken.metadata.recordingPermissions;
		} catch (error: any) {
			this.log.e('Error setting recording token in context', error);
			throw new Error('Error setting recording token', error);
		}
	}

	canRetrieveRecordings(): boolean {
		return this.context.recordingPermissions.canRetrieveRecordings;
	}

	canDeleteRecordings(): boolean {
		return this.context.recordingPermissions.canDeleteRecordings;
	}

	setLeaveRedirectUrl(leaveRedirectUrl: string): void {
		this.context.leaveRedirectUrl = leaveRedirectUrl;
	}

	getLeaveRedirectURL(): string {
		return this.context.leaveRedirectUrl;
	}

	private async getSecurityPreferences() {
		if (!this.context.securityPreferences) {
			try {
				this.context.securityPreferences = await this.httpService.getSecurityPreferences();
			} catch (error) {
				this.log.e('Error getting security preferences', error);
				throw new Error('Error getting security preferences');
			}
		}
	}

	private getValidDecodedToken(token: string) {
		this.checkIsJWTValid(token);
		const decodedToken: any = jwtDecode(token);
		decodedToken.metadata = JSON.parse(decodedToken.metadata);

		if (decodedToken.exp && Date.now() >= decodedToken.exp * 1000) {
			throw new Error('Token is expired. Please, request a new one');
		}

		return decodedToken;
	}

	private checkIsJWTValid(token: string) {
		if (!token || typeof token !== 'string') {
			throw new Error('Invalid token. Token must be a string');
		}

		const tokenParts = token.split('.');
		if (tokenParts.length !== 3) {
			throw new Error('Invalid token. Token must be a valid JWT');
		}
	}
}
