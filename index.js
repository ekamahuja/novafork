function handleError(message, error, showAlert = false) {
    console.error(message, error);
    if (showAlert) {
        alert(message);
    }
}

async function getApiKey() {
    try {
        const response = await $.getJSON('apis/config.json');
        return response.apiKey;
    } catch (error) {
        handleError('Failed to fetch API key.', error);
        return null;
    }
}

async function fetchGenres(apiKey, mediaType) {
    try {
        const endpoint = mediaType === 'tv' ? 'genre/tv/list' : 'genre/movie/list';
        const response = await $.getJSON(`https://api.themoviedb.org/3/${endpoint}?api_key=${apiKey}&language=en-US`);
        return response.genres;
    } catch (error) {
        handleError('An error occurred while fetching genres:', error);
        return [];
    }
}

$(document).ready(async function () {
    const $homePage = $('#homePage');
    const $welcomeBanner = $('#welcomeBanner');
    const $closeBanner = $('#closeBanner');
    const $categorySelect = $('#categorySelect');
    const $typeSelect = $('#typeSelect');
    const $popularMedia = $('#popularMedia');
    const $videoPlayerContainer = $('#videoPlayerContainer');
    const $videoPlayer = $('#videoPlayer');
    const $posterImage = $('#posterImage');
    const $searchInput = $('#searchInput');
    const $actorSearchInput = $('#actorSearchInput');
    const $searchSuggestions = $('#searchSuggestions');
    const $randomButton = $('#randomButton');

    let currentMediaType = 'popular';
    let currentPage = 1;
    let totalPages = 1;
    let currentActorId = null;

    if ($closeBanner.length) {
        $closeBanner.on('click', () => {
            $welcomeBanner.hide();
        });
    }

    if ($homePage.length) {
        $homePage.removeClass('hidden');
    }

    const API_KEY = await getApiKey();
    if (!API_KEY) return;

    let genreMap = {};
    async function updateGenres(mediaType) {
        const genres = await fetchGenres(API_KEY, mediaType);
        genreMap = genres.reduce((map, genre) => {
            map[genre.id] = genre.name;
            return map;
        }, {});

        if ($categorySelect.length) {
            $categorySelect.html('<option value="">Select Genre</option>');
            $.each(genreMap, function(id, name) {
                $categorySelect.append(new Option(name, id));
            });
        }
    }

    await updateGenres('movie');

    if ($typeSelect.length) {
        $typeSelect.html(`
            <option value="movie">Movies</option>
            <option value="tv">TV Shows</option>
        `);

        $typeSelect.on('change', async function () {
            const selectedType = $(this).val();
            await updateGenres(selectedType);
            currentPage = 1; // Reset to first page
            await fetchPopularMedia(currentPage);
        });
    }

    // Event listener for actorSearchInput
    if ($actorSearchInput.length) {
        $actorSearchInput.on(
            'input',
            debounce(async function () {
                const actorName = $actorSearchInput.val().trim();
                if (actorName.length > 2) {
                    const response = await $.getJSON(
                        `https://api.themoviedb.org/3/search/person?api_key=${API_KEY}&query=${encodeURIComponent(actorName)}`
                    );
                    if (response.results.length > 0) {
                        const actorId = response.results[0].id; // First actor result
                        currentActorId = actorId;
                        currentMediaType = 'actor';
                        currentPage = 1;
                        await fetchMoviesAndShowsByActor(actorId, currentPage);
                    } else {
                        handleError('No actor found with that name.');
                        clearMediaDisplay();
                        totalPages = 1;
                        updatePaginationControls(currentPage, totalPages);
                    }
                } else {
                    // Input is too short; reset to popular media
                    currentMediaType = 'popular';
                    currentPage = 1;
                    await fetchPopularMedia(currentPage);
                }
            }, 500) // Debounce delay of 500ms
        );
    }

    // Pagination Controls
    const $prevPageButton = $('#prevPage');
    const $nextPageButton = $('#nextPage');

    if ($prevPageButton.length && $nextPageButton.length) {
        $prevPageButton.on('click', async function () {
            if (currentPage > 1) {
                currentPage--;
                await updateMediaDisplay();
            }
        });

        $nextPageButton.on('click', async function () {
            if (currentPage < totalPages) {
                currentPage++;
                await updateMediaDisplay();
            }
        });
    }

    if ($searchInput.length) {
        $('#searchButton').on('click', () => search());
        $searchInput.on('keydown', async function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                await search();
            }
        });

        $searchInput.on(
            'input',
            debounce(async function () {
                const query = $searchInput.val().trim();
                if (query.length > 2) {
                    const selectedCategory = $categorySelect.val();
                    const selectedType = $typeSelect.val();
                    const response = await $.getJSON(
                        `https://api.themoviedb.org/3/search/${selectedType}?api_key=${API_KEY}&query=${encodeURIComponent(query)}&with_genres=${selectedCategory}`
                    );
                    if (response.results.length > 0) {
                        displaySearchSuggestions(response.results);
                    } else {
                        $searchSuggestions.addClass('hidden');
                    }
                } else {
                    $searchSuggestions.addClass('hidden');
                }
            }, 500) // Debounce delay of 500ms
        );
    }

    if ($categorySelect.length) {
        $categorySelect.on('change', async function () {
            currentPage = 1;
            await fetchPopularMedia(currentPage);
        });
    }

    if ($typeSelect.length) {
        $typeSelect.on('change', async function () {
            currentPage = 1;
            await fetchPopularMedia(currentPage);
        });
    }

    async function fetchPopularMedia(page = 1) {
        currentMediaType = 'popular';
        currentPage = page;
        const selectedCategory = $categorySelect.val();
        const selectedType = $typeSelect.val();
        let url = '';
        let queryParams = `?api_key=${API_KEY}&page=${page}&language=en-US`;

        try {
            if (selectedCategory) {
                url = `https://api.themoviedb.org/3/discover/${selectedType}${queryParams}&with_genres=${selectedCategory}`;
            } else if (selectedType === 'tv') {
                url = `https://api.themoviedb.org/3/trending/tv/week${queryParams}`;
            } else {
                url = `https://api.themoviedb.org/3/trending/movie/week${queryParams}`;
            }

            const response = await $.getJSON(url);
            if (response.total_results === 0) {
                clearMediaDisplay();
                handleError('No media found.');
                totalPages = 1;
                updatePaginationControls(currentPage, totalPages);
                return;
            }

            const results = response.results.slice(0, 12); // Limit to 12 items
            totalPages = response.total_pages; // Use data.total_pages directly
            displayPopularMedia(results);
            updatePaginationControls(currentPage, totalPages);
        } catch (error) {
            handleError(`An error occurred while fetching ${selectedType} media.`, error);
        }
    }

    async function fetchMoviesAndShowsByActor(actorId, page = 1) {
        currentMediaType = 'actor';
        currentPage = page;
        const selectedType = $typeSelect.val();
        const url = `https://api.themoviedb.org/3/discover/${selectedType}?api_key=${API_KEY}&with_cast=${actorId}&language=en-US&page=${page}`;

        try {
            const response = await $.getJSON(url);
            if (response.total_results === 0) {
                clearMediaDisplay();
                handleError('No media found for this actor.');
                totalPages = 1;
                updatePaginationControls(currentPage, totalPages);
                return;
            }

            const results = response.results.slice(0, 12); // Limit to 12 items
            totalPages = response.total_pages; // Use data.total_pages directly
            displayPopularMedia(results);
            updatePaginationControls(currentPage, totalPages);
        } catch (error) {
            handleError('An error occurred while fetching media for the actor.', error);
        }
    }

    async function updateMediaDisplay() {
        if (currentMediaType === 'actor' && currentActorId) {
            await fetchMoviesAndShowsByActor(currentActorId, currentPage);
        } else if (currentMediaType === 'search') {
            await search(currentPage);
        } else {
            await fetchPopularMedia(currentPage);
        }
    }

    function clearMediaDisplay() {
        if ($popularMedia.length) {
            $popularMedia.empty();
        }
    }

    await fetchPopularMedia(currentPage);

    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    async function fetchSelectedMedia(mediaId, mediaType) {
        try {
            const response = await $.getJSON(`https://api.themoviedb.org/3/${mediaType}/${mediaId}?api_key=${API_KEY}`);
            if (response) {
                const media = response;

                const releaseType = await getReleaseType(mediaId, mediaType);

                const titleSlug = media.title ? media.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : media.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const newUrl = `${window.location.origin}${window.location.pathname}?title=${encodeURIComponent(titleSlug)}`;
                window.history.pushState({ mediaId, mediaType, title: media.title || media.name }, '', newUrl);

                displaySelectedMedia(media, mediaType, releaseType);
                await fetchMediaTrailer(mediaId, mediaType);

                if ($posterImage.length && media.poster_path) {
                    $posterImage.attr('src', `https://image.tmdb.org/t/p/w300${media.poster_path}`);
                    $posterImage.attr('alt', media.title || media.name);
                }

                $videoPlayerContainer.removeClass('hidden');
            } else {
                handleError('Failed to fetch media details.', new Error('API response not OK'));
                $videoPlayerContainer.addClass('hidden');
            }
        } catch (error) {
            handleError('An error occurred while fetching media details.', error);
            $videoPlayerContainer.addClass('hidden');
        }
    }

    async function getReleaseType(mediaId, mediaType) {
        try {
            const [releaseDatesResponse, watchProvidersResponse] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/release_dates?api_key=${API_KEY}`),
                fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/watch/providers?api_key=${API_KEY}`)
            ]);

            if (!releaseDatesResponse.ok || !watchProvidersResponse.ok) {
                throw new Error('Failed to fetch release type or watch providers.');
            }

            const releaseDatesData = await releaseDatesResponse.json();
            const watchProvidersData = await watchProvidersResponse.json();

            const releases = releaseDatesData.results.flatMap(result => result.release_dates);
            const currentDate = new Date();

            const currentUtcDate = new Date(currentDate.toISOString().slice(0, 10)); // Strip time info to only compare dates


            const isDigitalRelease = releases.some(release =>
                (release.type === 4 || release.type === 6) && new Date(release.release_date).getTime() <= currentUtcDate.getTime()
            );

            const theaterRelease = releases.find(release => release.type === 3);
            const isInTheaters = theaterRelease && new Date(theaterRelease.release_date).getTime() <= currentUtcDate.getTime();

            const hasFutureRelease = releases.some(release =>
                new Date(release.release_date).getTime() > currentUtcDate.getTime()
            );

            const streamingRegions = ['US', 'UK', 'CA', 'AU'];
            let isStreamingAvailable = false;
            for (const region of streamingRegions) {
                const providers = watchProvidersData.results?.[region]?.flatrate || [];
                if (providers.length > 0) {
                    isStreamingAvailable = true;
                    break;
                }
            }

            let isRentalOrPurchaseAvailable = false;
            for (const region of streamingRegions) {
                const rentalProviders = watchProvidersData.results?.[region]?.rent || [];
                const buyProviders = watchProvidersData.results?.[region]?.buy || [];
                if (rentalProviders.length > 0 || buyProviders.length > 0) {
                    isRentalOrPurchaseAvailable = true;
                    break;
                }
            }

            if (isStreamingAvailable || isDigitalRelease) {
                return "HD";
            } else if (isInTheaters && !isStreamingAvailable && !isDigitalRelease) {
                return "Cam";
            } else if (hasFutureRelease && !isInTheaters) {
                return "Not Released Yet";
            } else if (isRentalOrPurchaseAvailable) {
                return "Rental/Buy Available";
            }

            return "Unknown Quality";
        } catch (error) {
            console.error('Error occurred while fetching release type:', error);
            return "Unknown Quality";
        }
    }

    async function displayPopularMedia(results) {
        $popularMedia.empty();
    
        const limitedResults = results.slice(0, 12);
    
        const mediaWithReleaseType = await Promise.all(limitedResults.map(async (media) => {
            const mediaType = media.media_type || (media.title ? 'movie' : 'tv');
            const releaseType = mediaType === 'movie' || mediaType === 'animation' ? await getReleaseType(media.id, mediaType) : '';
            return { ...media, releaseType };
        }));
    
        mediaWithReleaseType.forEach(media => {
            const $mediaCard = $('<div class="media-card"></div>');
    
            const genreNames = media.genre_ids ? media.genre_ids.map(id => genreMap[id] || 'Unknown').join(', ') : 'N/A';
            const formattedDate = media.release_date ? new Date(media.release_date).toLocaleDateString() : (media.first_air_date ? new Date(media.first_air_date).toLocaleDateString() : 'Unknown Date');
            const ratingStars = Array.from({ length: 5 }, (_, i) => i < Math.round(media.vote_average / 2) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join('');
    
            const mediaType = media.media_type || (media.title ? 'movie' : 'tv');
            const displayType = mediaType === 'movie' || mediaType === 'animation' ? media.releaseType : '';
    
            $mediaCard.html(`
                <img src="https://image.tmdb.org/t/p/w500${media.poster_path}" alt="${media.title || media.name}" class="media-image">
                ${displayType ? `<div class="release-type">${displayType}</div>` : ''}
                <div class="media-content">
                    <h3 class="media-title">${media.title || media.name}</h3>
                    <p class="media-type">
                        ${mediaType === 'movie' ? '<i class="fas fa-film"></i> Movie' : 
                          mediaType === 'tv' ? '<i class="fas fa-tv"></i> TV Show' : 
                          '<i class="fas fa-video"></i> Animation'}
                    </p>
                    <div class="media-details">
                        <p><i class="fas fa-theater-masks"></i> Genres: ${genreNames}</p>
                        <div>
                            <span class="rating-stars">${ratingStars}</span>
                            <span>${media.vote_average.toFixed(1)}/10</span>
                        </div>
                        <p><i class="fas fa-calendar-alt"></i> Release Date: ${formattedDate}</p>
                    </div>
                </div>
            `);
            $mediaCard.on('click', function () {
                fetchSelectedMedia(media.id, mediaType);
            });
            $popularMedia.append($mediaCard);
        });
    }

    async function fetchMediaTrailer(mediaId, mediaType) {
        try {
            const response = await $.getJSON(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/videos?api_key=${API_KEY}`);
            const trailer = response.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
            if (trailer) {
                $videoPlayer.attr('src', `https://www.youtube.com/embed/${trailer.key}`);
            } else {
                $videoPlayer.attr('src', '');
                $videoPlayerContainer.addClass('hidden');
            }
        } catch (error) {
            handleError('An error occurred while fetching media trailer.', error);
            $videoPlayerContainer.addClass('hidden');
        }
    }

    async function loadMediaFromUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const title = urlParams.get('title');

        if (title) {
            const response = await $.getJSON(`https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(title)}`);
            const media = response.results.find(item => (item.title && item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === title) || (item.name && item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === title));
            if (media) {
                const mediaType = media.media_type || (media.title ? 'movie' : 'tv');
                await fetchSelectedMedia(media.id, mediaType);
            }
        }
    }

    if ($categorySelect.length) {
        $categorySelect.on('change', function () {
            fetchPopularMedia();
        });
    }

    fetchPopularMedia();
    loadMediaFromUrlParams();
});
