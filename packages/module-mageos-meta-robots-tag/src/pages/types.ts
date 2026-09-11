/** The three attributes the module adds to products, categories and CMS pages. */
export type RobotsFlag = 'no_index' | 'no_follow' | 'no_archive';

export type RobotsFlags = Partial<Record<RobotsFlag, boolean>>;

export interface CmsPageSpec {
  title: string;
  urlKey: string;
  flags: RobotsFlags;
}
