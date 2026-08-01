import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Try fetching the URL to follow redirects
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow', // Follow redirects to get the expanded URL
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const finalUrl = response.url;
    
    // Now extract lat/long from the final URL
    const gmMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || finalUrl.match(/\?q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    const osmMatch = finalUrl.match(/map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
    const latLngMatch = finalUrl.match(/(-?\d+\.\d+)(?:,|\s)+(-?\d+\.\d+)/);
    
    const match = gmMatch || osmMatch || latLngMatch;
    
    if (match) {
      return NextResponse.json({
        latitude: parseFloat(match[1]),
        longitude: parseFloat(match[2]),
        expandedUrl: finalUrl
      });
    }

    return NextResponse.json({ error: 'Could not find coordinates in the URL' }, { status: 400 });

  } catch (error: any) {
    console.error('Error expanding URL:', error);
    return NextResponse.json({ error: 'Failed to expand URL' }, { status: 500 });
  }
}
