/**
 * Permissions renamed before the release that introduced them, which documents written by that release's
 * development builds still carry under their first name. normalizePermissions() drops a key it does not know,
 * so every normalization of a stored document renames them first.
 */
const PERMISSIONS_RENAMED_BEFORE_RELEASE = {
	participantHandLower: 'participantLowerHand',
	participantReactionSend: 'participantSendReaction'
} as const;

export const renamePermissionsRenamedBeforeRelease = (permissions: object | undefined): void => {
	if (!permissions) return;

	const record = permissions as Record<string, unknown>;

	for (const [firstName, currentName] of Object.entries(PERMISSIONS_RENAMED_BEFORE_RELEASE)) {
		if (firstName in record) {
			record[currentName] ??= record[firstName];
			delete record[firstName];
		}
	}
};
