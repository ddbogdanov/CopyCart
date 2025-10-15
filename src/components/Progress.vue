<template>
<div class="progress-container">

	<div class="progress-bar">
		<ProgressBar :value="props.progress"/>

		<span>
			<p id="statusLabel">{{ props.status }}</p>
		</span>

		<div class="icons" :class="{ 'loading': props.isLoading }">
			<i class="pi pi-arrow-right"/>
			<i class="pi pi-arrow-right"/>
			<i class="pi pi-arrow-right"/>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
const props = defineProps(['currentFile', 'isLoading', 'progress', 'status'])
</script>

<style scoped lang="scss">
	.progress-container {
		width: 100%;

		padding: 10px;
	}

	.progress-bar {		
		span {
			display: flex;
			justify-content: space-between;
		}
		p {
			margin:0;
			font-size: 12px;
		}
		.icons {
			display: flex;
			justify-content: space-between;

			padding-top: 3px;

			color: var(--p-surface-500);
		}

		#statusLabel {
			color: var(--p-surface-500);

			font-size: 10px;
			padding: 5px;
		}
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1.1); color: var(--p-primary-color);}
		20%, 100% { opacity: 0.3; transform: scale(1); color: var(--p-surface-500);}
	}

	.loading i {
		animation: pulse 3s infinite cubic-bezier(.9,.5,.1,.8);

		&:nth-child(1) {
			animation-delay: 0s;
		}
		&:nth-child(2) {
			animation-delay: .8s;
		}
		&:nth-child(3) {
			animation-delay: 1.6s;
		}
	}

	::v-deep(.p-progressbar-value) {
 		transition: width 0.1s linear !important;
	}
</style>