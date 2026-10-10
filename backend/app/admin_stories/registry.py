"""등록 가능한 이야기와 그 이야기가 쓰는 데이터 묶음(D-37).

서버가 이 목록 밖의 이름으로 파일을 쓰지 않게 하는 기준이다. 이야기 문구 · 화면은 프론트 코드에 있으므로(D-35) 이야기를
추가할 때 frontend/src/lib/stories/registry.ts 와 함께 고친다. 묶음 순서는 이야기 파일의 datasets 순서다.
"""

STORY_REGISTRY: dict[str, tuple[str, ...]] = {
    "element-discovery": ("elements_ko", "element_discoveries"),
    "light-age": ("sky_objects", "earth_moments"),
    "black-hole": ("black_holes", "bh_boundaries"),
    "sunken-cities": ("atlantis_criteria", "sunken_places", "sunken_measures"),
    "starry-night": ("vangogh_starry_night",),
}
