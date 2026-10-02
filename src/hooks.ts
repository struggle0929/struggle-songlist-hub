import type { Reroute } from '@sveltejs/kit';
import { pathContext } from '$lib/streamers';

export const reroute: Reroute = ({ url }) => pathContext(url.pathname).pathname;
