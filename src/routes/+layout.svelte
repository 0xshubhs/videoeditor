<script lang="ts">
	import { createEditorContext } from '$lib/state/context.js';
	import '../app.css';

	const ctx = createEditorContext();

	let { children } = $props();
</script>

<svelte:head>
	<title>MEOW Video Editor</title>
</svelte:head>

{@render children()}
