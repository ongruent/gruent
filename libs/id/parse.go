package id

import (
	"fmt"
)

// IdType identifies the kind of resource an ID belongs to, based on its prefix. The prefixes are baked into
// existing IDs, so they are unchanged when a resource is renamed (a connection still uses "t", a step still uses "n").
type IdType string

const (
	IdTypeUser             IdType = "u"
	IdTypeModel            IdType = "m"
	IdTypeConnection       IdType = "t"
	IdTypeChannel          IdType = "c"
	IdTypeApiKey           IdType = "tea_"
	IdTypePermissionSet    IdType = "p"
	IdTypeOrganization     IdType = "o"
	IdTypeSpace            IdType = "s"
	IdTypeChannelExecution IdType = "x"
	IdTypeStep             IdType = "n"
)

func Parse(id string) (IdType, error) {
	if len(id) < 2 {
		return "", fmt.Errorf("invalid ID: %s", id)
	}

	if id[0] == 't' {
		if id[:5] == string(IdTypeApiKey) {
			return IdTypeApiKey, nil
		}
	}

	switch string(id[0]) {
	case string(IdTypeOrganization):
		return IdTypeOrganization, nil
	case string(IdTypeSpace):
		return IdTypeSpace, nil
	case string(IdTypeUser):
		return IdTypeUser, nil
	case string(IdTypeModel):
		return IdTypeModel, nil
	case string(IdTypeConnection):
		return IdTypeConnection, nil
	case string(IdTypeChannel):
		return IdTypeChannel, nil
	case string(IdTypeStep):
		return IdTypeStep, nil
	case string(IdTypePermissionSet):
		return IdTypePermissionSet, nil
	case string(IdTypeChannelExecution):
		return IdTypeChannelExecution, nil
	}

	return "", fmt.Errorf("invalid ID: %s", id)
}
