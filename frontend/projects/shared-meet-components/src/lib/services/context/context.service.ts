import { Injectable } from '@angular/core';
import { jwtDecode } from 'jwt-decode';
import { ApplicationMode, ContextData, Edition } from '../../models/context.model';
import { LoggerService } from 'openvidu-components-angular';
import {
	AuthMode,
	HttpService,
	OpenViduMeetPermissions,
	ParticipantRole
} from 'projects/shared-meet-components/src/public-api';
import { FeatureConfigurationService } from '../feature-configuration/feature-configuration.service';

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

	protected log;

	/**
	 * Initializes a new instance of the ContextService class.
	 */
	constructor(
		protected loggerService: LoggerService,
		protected featureConfService: FeatureConfigurationService,
		protected httpService: HttpService
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

	async getAuthModeToAccessRoom(): Promise<AuthMode> {
		await this.getSecurityPreferences();
		return this.context.securityPreferences!.authentication.authModeToAccessRoom;
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
	 * Sets the participant token in the context and updates feature configuration.
	 * @param token - The JWT token to set.
	 * @throws Error if the token is invalid or expired.
	 */
	setParticipantTokenAndUpdateContext(token: string): void {
		try {
			const decodedToken = this.getValidDecodedToken(token);
			this.setParticipantToken(token);
			this.setParticipantPermissions(decodedToken.metadata.permissions);
			this.setParticipantRole(decodedToken.metadata.role);
		} catch (error: any) {
			this.log.e('Error setting token in context', error);
			throw new Error('Error setting token', error);
		}
	}

	setParticipantToken(token: string): void {
		this.context.participantToken = token;
	}

	getParticipantToken(): string {
		return this.context.participantToken;
	}

	setParticipantRole(participantRole: ParticipantRole): void {
		this.context.participantRole = participantRole;
		this.featureConfService.setParticipantRole(participantRole);
	}

	getParticipantRole(): ParticipantRole {
		return this.context.participantRole;
	}

	isModeratorParticipant(): boolean {
		return this.context.participantRole === ParticipantRole.MODERATOR;
	}

	setParticipantPermissions(permissions: OpenViduMeetPermissions): void {
		this.context.participantPermissions = permissions;
		this.featureConfService.setParticipantPermissions(permissions);
	}

	getParticipantPermissions() {
		return this.context.participantPermissions;
	}

	setRecordingPermissionsFromToken(token: string): void {
		try {
			const decodedToken = this.getValidDecodedToken(token);
			this.context.recordingPermissions = decodedToken.metadata.recordingPermissions;
			this.featureConfService.setRecordingPermissions(decodedToken.metadata.recordingPermissions);
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
