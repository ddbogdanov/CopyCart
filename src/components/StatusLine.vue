<template>
	<div class="status-line">
		<span class="status-leading"><slot name="leading" /></span>
		<p class="status-text" :class="{ placeholder }"><slot /></p>
		<span class="status-trailing"><slot name="trailing" /></span>
	</div>
</template>

<script setup lang="ts">
/**
 * Shared status row for the cards: leading icon hard-left, text centered, and
 * an optional trailing action hard-right. The `1fr auto 1fr` grid keeps the
 * text centered even though the side contents differ in width.
 */
defineProps({
	/** Faded look for the "nothing selected yet" text. */
	placeholder: { type: Boolean, default: false }
})
</script>

<style scoped lang="scss">
.status-line {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	gap: 6px;

	width: 100%;
	min-width: 0;
	flex-shrink: 0;

	.status-leading {
		justify-self: start;

		display: inline-flex;
		align-items: center;

		font-size: 13px;
		color: var(--p-primary-500);
	}

	.status-text {
		justify-self: center;
		margin: 0;

		font-size: 12px;
		color: var(--p-surface-400);

		max-width: 100%;

		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;

		&.placeholder {
			opacity: 0.7;
		}
	}

	.status-trailing {
		justify-self: end;

		display: inline-flex;
		align-items: center;
	}
}
</style>
