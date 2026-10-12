/**
 * Controller of the configuration page: loads the data of the page, then the page script, which may come from the configured test commit.
 */
export default function (view) {
    const apiClient = window.ApiClient;

    Dashboard.showLoadingMsg();

    apiClient.getJSON(apiClient.getUrl('GenreMapper/Data'))
        .then(function (data) {
            return import(apiClient.getUrl('GenreMapper/Web/configPage.js', { v: data.Version })).then(function (page) {
                return page.init(view, data);
            });
        })
        .catch(function (error) {
            console.error('[GenreMapper] Failed to load the configuration page', error);
        })
        .then(function () {
            Dashboard.hideLoadingMsg();
        });
}
