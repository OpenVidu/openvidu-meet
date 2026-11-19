export const setsAreEqual = <T>(setA: Set<T>, setB: Set<T>): boolean => {
	if (setA.size !== setB.size) return false;

	for (const item of setA) {
		if (!setB.has(item)) return false;
	}

	return true;
};
